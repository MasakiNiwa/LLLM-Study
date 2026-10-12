/// <reference lib="webworker" />
/**
 * LiteRT-LM を動かす専用 Worker。
 *
 * モデル読み込み・推論・OPFS への保存などの重い処理をすべてここで行い、
 * メインスレッド（UI）は常に 60fps で動けるようにする。
 * Comlink で RPC として公開する。
 *
 * NOTE: LiteRT-LM の Wasm ローダーは importScripts() を使うため、
 *       この Worker は classic worker（vite の worker.format = 'iife'）としてビルドする。
 */
import {
  Backend,
  Engine,
  SamplerType,
  type Conversation,
  type ConversationConfig,
  type Message,
} from '@litert-lm/core';
import * as Comlink from 'comlink';
import { fileNameFromUrl, normalizeModelUrl } from './download';
import { getStoredModelFile, saveModelFile, saveModelStream } from './modelStorage';
import { userMessageSuffix } from './modelQuirks';
import { countingStream, ensureRuntime } from './runtime';
import type {
  BackendKind,
  ChatTurn,
  ConversationSettings,
  DownloadProgress,
  GenerateEvent,
  GenerateRequest,
  GenerateResult,
  GenerationStats,
  JsonValue,
  LoadModelRequest,
  ToolCallInfo,
  ToolDeclaration,
  LoadProgress,
  LoadedModelInfo,
} from './types';

const BACKEND_MAP: Record<BackendKind, number> = {
  'gpu-artisan': Backend.GPU_ARTISAN,
  gpu: Backend.GPU,
  cpu: Backend.CPU,
};

let engine: Engine | null = null;
let modelInfo: LoadedModelInfo | null = null;

let conversation: Conversation | null = null;
/** 現在の Conversation が保持している履歴の ID 列と設定キー（KV キャッシュ再利用の判定用） */
let conversationTurnIds: string[] | null = null;
let conversationSettingsKey = '';
let cancelRequested = false;
/** 生成中の Conversation（中断用。単発の生成では、チャットとは別の一時的なもの） */
let active: Conversation | null = null;
/** このモデル（バックエンド）では、チャットの会話を残したまま別の会話を作れなかった */
let parallelUnsupported = false;
let downloadAbort: AbortController | null = null;

/** 1 回の発話でツールを呼び合う最大回数（無限ループ防止） */
const MAX_TOOL_ROUNDS = 6;

async function disposeConversation(): Promise<void> {
  const conv = conversation;
  conversation = null;
  conversationTurnIds = null;
  if (conv) await conv.delete().catch(() => undefined);
}

function settingsKey(s: ConversationSettings, tools: ToolDeclaration[] | undefined): string {
  return JSON.stringify([s, tools?.map((t) => t.name) ?? []]);
}

/** suffix: ユーザー発話の末尾に付ける制御文字列（モデルごとの癖への対応） */
function turnToMessage(turn: ChatTurn, suffix = ''): Message {
  const text = turn.role === 'user' ? turn.text + suffix : turn.text;
  return { role: turn.role, content: [{ type: 'text', text }] };
}

function buildConversationConfig(
  s: ConversationSettings,
  history: ChatTurn[],
  suffix: string,
  tools: ToolDeclaration[] | undefined,
): ConversationConfig {
  const messages: Message[] = [];
  if (s.systemPrompt.trim()) {
    messages.push({ role: 'system', content: [{ type: 'text', text: s.systemPrompt }] });
  }
  messages.push(...history.map((t) => turnToMessage(t, suffix)));
  const greedy = s.temperature <= 0;
  return {
    sessionConfig: {
      samplerParams: greedy
        ? { type: SamplerType.GREEDY }
        : { type: SamplerType.TOP_P, k: s.topK, p: s.topP, temperature: s.temperature },
      maxOutputTokens: s.maxOutputTokens,
    },
    preface: {
      messages,
      ...(tools && tools.length > 0
        ? { tools: tools.map((t) => ({ type: 'function', function: t })) }
        : {}),
      extra_context: { enable_thinking: s.enableThinking },
    },
  };
}

function arraysEqual(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** 文字列 or ContentPart[] からテキストを取り出す */
function extractText(content: Message['content']): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  let text = '';
  for (const part of content) {
    if (part.type === 'text') text += part.text;
  }
  return text;
}

const api = {
  /** Wasm ランタイムを先読みする（モデル読み込みを速く見せるため） */
  async warmup(wasmBaseUrl: string): Promise<void> {
    await ensureRuntime(wasmBaseUrl);
  },

  async loadModel(
    wasmBaseUrl: string,
    req: LoadModelRequest,
    onProgress: (p: LoadProgress) => void,
  ): Promise<LoadedModelInfo> {
    const started = performance.now();
    onProgress({ phase: 'runtime', loadedBytes: 0, totalBytes: 0 });
    await api.unloadModel();
    await ensureRuntime(wasmBaseUrl);

    const file =
      req.source.kind === 'file' ? req.source.file : await getStoredModelFile(req.source.name);
    const total = file.size;
    let readBytes = 0;
    let savedBytes: number | undefined;
    const report = (phase: LoadProgress['phase']) =>
      onProgress({ phase, loadedBytes: readBytes, totalBytes: total, saveLoadedBytes: savedBytes });

    // 取り込み時は「読み込み」と「OPFS への保存」を並行して行う（同じ File を 2 回読む）
    let savePromise: Promise<string | undefined> = Promise.resolve(undefined);
    const shouldSave = req.source.kind === 'file' && req.source.save;
    if (shouldSave) {
      savedBytes = 0;
      savePromise = saveModelFile(file, (n) => {
        savedBytes = n;
      }).then(
        () => undefined,
        (e: unknown) => (e instanceof Error ? e.message : String(e)),
      );
    }

    const stream = countingStream(file.stream(), (n) => {
      readBytes = n;
      report(readBytes >= total ? 'initializing' : 'reading');
    });

    try {
      engine = await Engine.create({
        model: stream,
        backend: BACKEND_MAP[req.backend] as Backend,
        mainExecutorSettings: { maxNumTokens: req.maxNumTokens },
        benchmarkEnabled: true,
      });
    } catch (e) {
      engine = null;
      throw e;
    }
    const saveError = await savePromise;
    modelInfo = {
      name: file.name,
      sizeBytes: total,
      backend: req.backend,
      maxNumTokens: req.maxNumTokens,
      loadTimeMs: performance.now() - started,
      saved: shouldSave && !saveError,
      saveError,
    };
    return modelInfo;
  },

  async unloadModel(): Promise<void> {
    await disposeConversation();
    active = null;
    // 別のモデル・バックエンドでは、2 つ目の会話を作れるかもしれないので確かめ直す
    parallelUnsupported = false;
    const e = engine;
    engine = null;
    modelInfo = null;
    if (e) await e.delete();
  },

  /** 会話をリセットする（次回の送信時に新しい Conversation を作る） */
  async resetConversation(): Promise<void> {
    await disposeConversation();
  },

  /**
   * URL からモデルをダウンロードし、OPFS に直接ストリーム保存する（メモリに溜めない）。
   * 戻り値は保存したファイル名。
   */
  async downloadModel(
    inputUrl: string,
    onProgress: (p: DownloadProgress) => void,
  ): Promise<string> {
    if (downloadAbort) throw new Error('別のダウンロードが進行中です');
    const url = normalizeModelUrl(inputUrl);
    const name = fileNameFromUrl(url);
    if (!name) throw new Error('URL の末尾が .litertlm ファイルではありません');

    const abort = new AbortController();
    downloadAbort = abort;
    try {
      const res = await fetch(url, { signal: abort.signal });
      if (!res.ok || !res.body) {
        throw new Error(
          res.status === 401 || res.status === 403
            ? `アクセスが拒否されました（HTTP ${res.status}）。ライセンスへの同意やログインが必要なモデルは、ブラウザでダウンロードしてから取り込んでください。`
            : `ダウンロードに失敗しました（HTTP ${res.status}）`,
        );
      }
      const total = Number(res.headers.get('content-length')) || 0;
      let lastReport = 0;
      const started = performance.now();
      await saveModelStream(name, res.body, {
        source: url,
        signal: abort.signal,
        onProgress: (loaded) => {
          const now = performance.now();
          if (now - lastReport < 100 && loaded !== total) return;
          lastReport = now;
          const elapsed = (now - started) / 1000;
          onProgress({
            name,
            loadedBytes: loaded,
            totalBytes: total,
            bytesPerSec: elapsed > 0 ? loaded / elapsed : 0,
          });
        },
      });
      return name;
    } finally {
      downloadAbort = null;
    }
  },

  cancelDownload(): void {
    downloadAbort?.abort();
  },

  cancel(): void {
    cancelRequested = true;
    (active ?? conversation)?.cancel();
  },

  async generate(
    req: GenerateRequest,
    onEvent: (e: GenerateEvent) => void,
    onToolCall?: (call: ToolCallInfo) => Promise<JsonValue>,
  ): Promise<GenerateResult> {
    if (!engine) throw new Error('モデルが読み込まれていません');
    cancelRequested = false;
    const started = performance.now();
    const oneshot = req.mode === 'oneshot';
    const tools = onToolCall ? req.tools : undefined;

    const suffix = userMessageSuffix(modelInfo?.name, req.settings.enableThinking);
    const config = buildConversationConfig(req.settings, req.history, suffix, tools);
    const key = settingsKey(req.settings, tools);
    const historyIds = req.history.map((t) => t.id);

    // 単発の生成で、チャットの会話（KV キャッシュ）を残す: 別の一時的な会話で生成して、終わったら消す。
    // このモデル・バックエンドで 2 つ目の会話を作れなければ、チャットの会話を捨ててから作る（次回からもそうする）
    let temp: Conversation | null = null;
    if (oneshot && req.keepChat && conversation && !parallelUnsupported) {
      try {
        temp = await engine.createConversation(config);
      } catch (e) {
        console.warn('チャットの会話を残したまま、別の会話を作れませんでした', e);
        parallelUnsupported = true;
      }
    }
    if (!temp) {
      // 履歴と設定が一致していれば既存の Conversation（KV キャッシュ）をそのまま使う
      if (
        oneshot ||
        !conversation ||
        conversationSettingsKey !== key ||
        !conversationTurnIds ||
        !arraysEqual(conversationTurnIds, historyIds)
      ) {
        await disposeConversation();
        conversation = await engine.createConversation(config);
        conversationSettingsKey = key;
        conversationTurnIds = historyIds;
      }
      // 生成中・中断・エラー時は履歴の整合が取れないので、成功時にのみ確定させる
      conversationTurnIds = null;
    }
    const conv = (temp ?? conversation)!;
    active = conv;
    /** 生成のあとの片付け: 一時的な会話は消す。チャットの会話は、捨てるときだけ捨てる */
    const finish = async (disposeChat: boolean) => {
      active = null;
      if (temp) await temp.delete().catch(() => undefined);
      else if (disposeChat) await disposeConversation();
    };
    onEvent({ type: 'prefill-start' });

    let ttftMs: number | undefined;
    // ツール呼び出しのループ。モデルが関数を呼んだらメインスレッドで実行し、結果を返して続きを生成させる
    let next: Message = turnToMessage(req.message, suffix);
    try {
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        const toolCalls: ToolCallInfo[] = [];
        const stream = conv.sendMessageStreaming(next);
        for await (const chunk of stream) {
          if (cancelRequested) break;
          if (ttftMs === undefined) {
            ttftMs = performance.now() - started;
            onEvent({ type: 'first-token' });
          }
          if (chunk.tool_calls) {
            for (const tc of chunk.tool_calls) {
              toolCalls.push({ name: tc.function.name, arguments: tc.function.arguments });
            }
          }
          const text = extractText(chunk.content);
          if (text) onEvent({ type: 'delta', text });
          if (chunk.channels) {
            for (const [channel, value] of Object.entries(chunk.channels)) {
              if (value) onEvent({ type: 'delta', text: value, channel });
            }
          }
        }
        if (cancelRequested || toolCalls.length === 0 || !onToolCall) break;
        const responses = [];
        for (const call of toolCalls) {
          onEvent({ type: 'tool-call', call });
          let response: JsonValue;
          let ok = true;
          try {
            response = await onToolCall(call);
          } catch (e) {
            ok = false;
            response = { error: e instanceof Error ? e.message : String(e) };
          }
          onEvent({ type: 'tool-result', name: call.name, ok });
          responses.push({ type: 'tool_response' as const, name: call.name, response });
        }
        if (cancelRequested) break;
        next = { role: 'tool', content: responses };
      }
    } catch (e) {
      if (!cancelRequested) {
        await finish(true);
        throw e;
      }
    }

    const stats: GenerationStats = {
      totalMs: performance.now() - started,
      ttftMs,
      backend: modelInfo?.backend,
    };
    if (cancelRequested) {
      // 中断した会話は次回送信時に履歴から作り直す（一時的な会話なら、チャットの会話はそのまま）
      await finish(true);
      return { status: 'cancelled', stats };
    }

    try {
      const b = await conv.getBenchmarkInfo();
      stats.prefillTokens = b.lastPrefillTokenCount;
      stats.prefillTokensPerSec = b.lastPrefillTokensPerSecond;
      stats.decodeTokens = b.lastDecodeTokenCount;
      stats.decodeTokensPerSec = b.lastDecodeTokensPerSecond;
      if (b.timeToFirstTokenInSecond > 0) stats.ttftMs = b.timeToFirstTokenInSecond * 1000;
    } catch {
      // ベンチマーク情報が無いモデル・バックエンドもある
    }
    try {
      stats.contextTokens = await conv.getTokenCount();
    } catch {
      // ignore
    }
    if (oneshot) {
      // 単発の生成はチャットの文脈を汚さないよう破棄する（一時的な会話でなければ、次のチャット送信時に履歴から作り直す）
      await finish(true);
    } else {
      active = null;
      conversationTurnIds = [...historyIds, req.message.id, req.assistantId];
    }
    return { status: 'done', stats };
  },
};

const workerApi = api;

export type EngineWorkerApi = typeof workerApi;

Comlink.expose(workerApi);
