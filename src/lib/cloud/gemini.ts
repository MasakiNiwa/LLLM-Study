/**
 * Gemini API（Google AI Studio の API キー）への接続。ブラウザから直接呼び出す（サーバーを使わない）。
 *
 * - キーは URL（?key=）ではなくヘッダー（x-goog-api-key）で送る。URL は履歴やログに残りやすいため
 * - 端末内のモデルと同じ GenerateRequest / GenerateEvent を使い、呼び出し側からは区別しないで使えるようにする
 * - ツール（関数呼び出し）は、モデルが呼んだら呼び出し側（onToolCall）で実行し、結果を返して続きを生成する
 *
 * SDK は使わず fetch だけで書く（依存を増やさない・送る内容をこのファイルで全部見渡せるようにする）。
 */
import type {
  ChatTurn,
  GenerateEvent,
  GenerateRequest,
  GenerateResult,
  JsonValue,
  ToolCallInfo,
  ToolSchema,
} from '@/lib/llm/types';
import { readSse } from './sse';

export const GEMINI_ORIGIN = 'https://generativelanguage.googleapis.com';
const API = `${GEMINI_ORIGIN}/v1beta`;

/** ツールを続けて呼べる回数（無限に呼び続けないように） */
const MAX_TOOL_ROUNDS = 5;
/** 考える過程を出すとき、答えまで届くよう出力の上限をこれ以上にする */
const MIN_OUTPUT_TOKENS_WITH_THINKING = 8192;

/** クラウド AI のエラー（retryable: 少し待てば・別の AI なら答えられる見込みがある） */
export class CloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'CloudError';
  }
}

interface GeminiPart {
  text?: string;
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: { name: string; args?: Record<string, JsonValue> };
  functionResponse?: { name: string; response: Record<string, JsonValue> };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

interface GeminiChunk {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    thoughtsTokenCount?: number;
  };
}

export interface GeminiModel {
  /** API で使う名前（例: gemini-2.5-flash） */
  id: string;
  displayName: string;
  inputTokenLimit?: number;
}

function headers(apiKey: string): HeadersInit {
  return { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey };
}

/** エラーの応答を、利用者に伝わる文にする（キーは含めない） */
async function toCloudError(res: Response): Promise<CloudError> {
  let detail = '';
  try {
    const body = (await res.json()) as { error?: { message?: string; status?: string } };
    detail = body.error?.message ?? '';
  } catch {
    // 本文が JSON でない
  }
  const s = res.status;
  if (s === 400 && /api key/i.test(detail))
    return new CloudError(
      'API キーが正しくありません。キーを確かめて登録し直してください。',
      s,
      false,
    );
  if (s === 400 && /location|region|country/i.test(detail))
    return new CloudError('この地域からは Gemini API を使えません。', s, false);
  if (s === 403)
    return new CloudError(
      `このキーでは使えません（キーの制限・API の有効化を確かめてください）。${detail ? `\n${detail}` : ''}`,
      s,
      false,
    );
  if (s === 404)
    return new CloudError('このモデルは使えません。別のモデルを選んでください。', s, false);
  if (s === 429)
    return new CloudError(
      '利用の上限に達しました（無料枠の回数・量の上限など）。しばらく待ってから使ってください。',
      s,
      true,
    );
  if (s >= 500) return new CloudError(`Gemini のサーバーが応答できませんでした（${s}）。`, s, true);
  return new CloudError(`Gemini API のエラー（${s}）${detail ? `: ${detail}` : ''}`, s, false);
}

/** 生成に使えるモデルの一覧（キーの確認にも使う。トークンを消費しない） */
export async function listGeminiModels(
  apiKey: string,
  signal?: AbortSignal,
): Promise<GeminiModel[]> {
  let res: Response;
  try {
    res = await fetch(`${API}/models?pageSize=200`, { headers: headers(apiKey), signal });
  } catch (e) {
    throw networkError(e);
  }
  if (!res.ok) throw await toCloudError(res);
  const body = (await res.json()) as {
    models?: {
      name: string;
      displayName?: string;
      supportedGenerationMethods?: string[];
      inputTokenLimit?: number;
    }[];
  };
  return (body.models ?? [])
    .filter(
      (m) =>
        m.name.startsWith('models/gemini') &&
        m.supportedGenerationMethods?.includes('generateContent') &&
        // 文章の生成に向かないもの（画像・音声・埋め込みなど）は除く
        !/embedding|image|tts|audio|live|vision|aqa|robotics|computer-use/i.test(m.name),
    )
    .map((m) => ({
      id: m.name.replace(/^models\//, ''),
      displayName: m.displayName ?? m.name,
      inputTokenLimit: m.inputTokenLimit,
    }));
}

/** 既定のモデル: 安定版（preview・exp でない）の Flash で、いちばん新しいもの。なければ先頭 */
export function pickDefaultGeminiModel(models: GeminiModel[]): string | null {
  const stable = models.filter((m) => !/preview|exp|lite|latest|\d{3}$/i.test(m.id));
  const flash = stable.filter((m) => /flash/i.test(m.id));
  const pool = flash.length ? flash : stable.length ? stable : models;
  if (!pool.length) return null;
  return [...pool].sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }))[0].id;
}

function networkError(e: unknown): Error {
  if (e instanceof DOMException && e.name === 'AbortError') return e;
  return new CloudError(
    'Gemini API に接続できませんでした（ネットワークを確かめてください）。',
    0,
    true,
  );
}

/** アプリのツールの型（小文字）を Gemini の型（大文字）にする */
function toGeminiSchema(s: ToolSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (s.type) out.type = s.type.toUpperCase();
  if (s.description) out.description = s.description;
  if (s.enum) out.enum = s.enum;
  if (s.required) out.required = s.required;
  if (s.items) out.items = toGeminiSchema(s.items);
  if (s.properties)
    out.properties = Object.fromEntries(
      Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)]),
    );
  return out;
}

function turnToContent(t: ChatTurn): GeminiContent {
  return { role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.text }] };
}

/** 考える設定を受け付けないモデル（一度断られたら送らない） */
const noThinkingConfig = new Set<string>();

export interface GeminiGenerateOptions {
  apiKey: string;
  model: string;
  signal: AbortSignal;
}

export async function geminiGenerate(
  req: GenerateRequest,
  opts: GeminiGenerateOptions,
  onEvent: (e: GenerateEvent) => void,
  onToolCall?: (call: ToolCallInfo) => Promise<JsonValue>,
): Promise<GenerateResult> {
  const started = performance.now();
  let ttft: number | undefined;
  let promptTokens = 0;
  let outputTokens = 0;
  const { settings } = req;
  const contents: GeminiContent[] = [...req.history, req.message].map(turnToContent);
  const tools =
    req.tools?.length && onToolCall
      ? [
          {
            functionDeclarations: req.tools.map((t) => ({
              name: t.name,
              description: t.description,
              ...(t.parameters && { parameters: toGeminiSchema(t.parameters) }),
            })),
          },
        ]
      : undefined;

  const body = (withThinkingConfig: boolean) => ({
    ...(settings.systemPrompt && {
      systemInstruction: { parts: [{ text: settings.systemPrompt }] },
    }),
    contents,
    ...(tools && { tools }),
    generationConfig: {
      temperature: settings.temperature,
      topP: settings.topP,
      topK: settings.topK,
      maxOutputTokens: settings.enableThinking
        ? Math.max(settings.maxOutputTokens, MIN_OUTPUT_TOKENS_WITH_THINKING)
        : settings.maxOutputTokens,
      ...(withThinkingConfig && {
        thinkingConfig: settings.enableThinking ? { includeThoughts: true } : { thinkingBudget: 0 },
      }),
    },
  });

  const post = async (): Promise<Response> => {
    const send = (withThinking: boolean) =>
      fetch(`${API}/models/${encodeURIComponent(opts.model)}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: headers(opts.apiKey),
        body: JSON.stringify(body(withThinking)),
        signal: opts.signal,
      });
    const useThinking = !noThinkingConfig.has(opts.model);
    let res = await send(useThinking);
    // 考える設定を受け付けないモデルなら、付けずに送り直す
    if (res.status === 400 && useThinking) {
      const text = await res.clone().text();
      if (/thinking/i.test(text)) {
        noThinkingConfig.add(opts.model);
        res = await send(false);
      }
    }
    return res;
  };

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      let res: Response;
      try {
        res = await post();
      } catch (e) {
        throw networkError(e);
      }
      if (!res.ok || !res.body) throw await toCloudError(res);

      const modelParts: GeminiPart[] = [];
      const calls: { name: string; args: Record<string, JsonValue> }[] = [];
      let produced = false;
      let finish: string | undefined;
      let blocked: string | undefined;
      for await (const data of readSse(res.body)) {
        let chunk: GeminiChunk;
        try {
          chunk = JSON.parse(data) as GeminiChunk;
        } catch {
          continue;
        }
        if (chunk.promptFeedback?.blockReason) blocked = chunk.promptFeedback.blockReason;
        if (chunk.usageMetadata) {
          promptTokens = chunk.usageMetadata.promptTokenCount ?? promptTokens;
          outputTokens =
            (chunk.usageMetadata.candidatesTokenCount ?? 0) +
            (chunk.usageMetadata.thoughtsTokenCount ?? 0);
        }
        const cand = chunk.candidates?.[0];
        if (cand?.finishReason) finish = cand.finishReason;
        for (const part of cand?.content?.parts ?? []) {
          // 送り直すときのため、モデルが返した形のまま（署名を含めて）残す
          modelParts.push(part);
          if (part.functionCall) {
            calls.push({ name: part.functionCall.name, args: part.functionCall.args ?? {} });
          } else if (part.text) {
            if (ttft === undefined) {
              ttft = performance.now() - started;
              onEvent({ type: 'first-token' });
            }
            produced = true;
            onEvent(
              part.thought
                ? { type: 'delta', text: part.text, channel: 'thought' }
                : { type: 'delta', text: part.text },
            );
          }
        }
      }
      if (blocked || (!produced && !calls.length && finish && finish !== 'STOP')) {
        throw new CloudError(
          `Gemini が応答を止めました（${blocked ?? finish}）。言い方を変えて試してください。`,
          200,
          false,
        );
      }
      if (!calls.length || !onToolCall) break;
      // ツールを実行して、結果を渡して続きを生成する
      contents.push({ role: 'model', parts: modelParts });
      const responses: GeminiPart[] = [];
      for (const c of calls) {
        onEvent({ type: 'tool-call', call: { name: c.name, arguments: c.args } });
        let result: JsonValue;
        let ok = true;
        try {
          result = await onToolCall({ name: c.name, arguments: c.args });
        } catch (e) {
          ok = false;
          result = { error: e instanceof Error ? e.message : String(e) };
        }
        onEvent({ type: 'tool-result', name: c.name, ok });
        const response =
          result && typeof result === 'object' && !Array.isArray(result)
            ? (result as Record<string, JsonValue>)
            : { result };
        responses.push({ functionResponse: { name: c.name, response } });
      }
      contents.push({ role: 'user', parts: responses });
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      return { status: 'cancelled', stats: stats() };
    }
    throw e;
  }
  return { status: 'done', stats: stats() };

  function stats() {
    const totalMs = performance.now() - started;
    const decodeMs = ttft === undefined ? 0 : totalMs - ttft;
    return {
      provider: `Gemini（${opts.model}）`,
      totalMs,
      ttftMs: ttft,
      prefillTokens: promptTokens || undefined,
      decodeTokens: outputTokens || undefined,
      decodeTokensPerSec:
        outputTokens && decodeMs > 0 ? outputTokens / (decodeMs / 1000) : undefined,
    };
  }
}
