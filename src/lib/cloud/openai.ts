/**
 * OpenAI API（ユーザーが契約した API キー）への接続。ブラウザから直接呼び出す（サーバーを使わない）。
 *
 * - Chat Completions（POST /v1/chat/completions, stream: true）を使う。OpenAI 互換の API（OpenRouter など）にも広げやすい
 * - キーは Authorization ヘッダーで送る。SDK は使わず fetch だけで書く
 * - 端末内のモデル・Gemini と同じ GenerateRequest / GenerateEvent を使う
 * - モデルの世代で受け付ける設定が違う（推論モデルは temperature を受け付けないなど）ので、
 *   400 で断られたら最小限の設定で送り直し、そのモデルでは次からも最小限で送る
 */
import type {
  GenerateEvent,
  GenerateRequest,
  GenerateResult,
  JsonValue,
  ToolCallInfo,
} from '@/lib/llm/types';
import { CloudError } from './errors';
import { readSse } from './sse';

export const OPENAI_ORIGIN = 'https://api.openai.com';
const API = `${OPENAI_ORIGIN}/v1`;

const MAX_TOOL_ROUNDS = 5;
/** 推論モデルは考える分も出力の上限に数えるので、答えまで届くよう下限を設ける */
const MIN_OUTPUT_TOKENS_REASONING = 4096;
const MIN_OUTPUT_TOKENS_WITH_THINKING = 16384;

export interface OpenAiModel {
  id: string;
  displayName: string;
}

type Message =
  | { role: 'system' | 'user'; content: string }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: {
        id: string;
        type: 'function';
        function: { name: string; arguments: string };
      }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

interface Chunk {
  choices?: {
    delta?: {
      content?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  } | null;
}

function headers(apiKey: string): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
}

/** 推論（考える）モデル。temperature を受け付けず、考える分も出力の上限に数える */
export function isReasoningModel(model: string): boolean {
  return /^(o\d|gpt-5)/i.test(model);
}

function networkError(e: unknown): Error {
  if (e instanceof DOMException && e.name === 'AbortError') return e;
  return new CloudError(
    'OpenAI API に接続できませんでした（ネットワークを確かめてください）。',
    0,
    true,
  );
}

/** エラーの応答を、利用者に伝わる文にする（キーは含めない） */
async function toCloudError(res: Response): Promise<CloudError> {
  let detail = '';
  let code = '';
  try {
    const body = (await res.json()) as {
      error?: { message?: string; code?: string; type?: string };
    };
    detail = body.error?.message ?? '';
    code = body.error?.code ?? body.error?.type ?? '';
  } catch {
    // 本文が JSON でない
  }
  const s = res.status;
  if (s === 401)
    return new CloudError(
      'API キーが正しくありません。キーを確かめて登録し直してください。',
      s,
      false,
    );
  if (s === 403)
    return new CloudError(
      `このキーでは使えません（キーの権限・プロジェクトの設定を確かめてください）。${detail ? `\n${detail}` : ''}`,
      s,
      false,
    );
  if (s === 404)
    return new CloudError(
      'このモデルは使えません（アクセス権がないか、名前が違います）。別のモデルを選んでください。',
      s,
      false,
    );
  if (s === 429 && /insufficient_quota/.test(code + detail))
    return new CloudError(
      '残高（クレジット）または利用上限が足りません。OpenAI の Billing・Limits を確かめてください。',
      s,
      false,
    );
  if (s === 429)
    return new CloudError('短い時間に使いすぎました。少し待ってから使ってください。', s, true);
  if (s >= 500) return new CloudError(`OpenAI のサーバーが応答できませんでした（${s}）。`, s, true);
  if (s === 400)
    return new CloudError(
      `OpenAI API が要求を受け付けませんでした（400）${detail ? `: ${detail}` : ''}\n「AI モデル」画面で別のモデルを選ぶと直ることがあります。`,
      s,
      false,
    );
  return new CloudError(`OpenAI API のエラー（${s}）${detail ? `: ${detail}` : ''}`, s, false);
}

/** 会話に使えるモデルの一覧（キーの確認にも使う。トークンを消費しない） */
export async function listOpenAiModels(
  apiKey: string,
  signal?: AbortSignal,
): Promise<OpenAiModel[]> {
  let res: Response;
  try {
    res = await fetch(`${API}/models`, { headers: headers(apiKey), signal });
  } catch (e) {
    throw networkError(e);
  }
  if (!res.ok) throw await toCloudError(res);
  const body = (await res.json()) as { data?: { id: string }[] };
  return (body.data ?? [])
    .map((m) => m.id)
    .filter(
      (id) =>
        /^(gpt-|o\d|chatgpt-)/i.test(id) &&
        // 会話に使わないもの（音声・画像・埋め込み・検索専用など）は除く
        !/audio|realtime|tts|transcribe|whisper|image|dall-e|embedding|moderation|search|instruct|codex|computer-use|deep-research/i.test(
          id,
        ),
    )
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
    .map((id) => ({ id, displayName: id }));
}

/**
 * 既定のモデル: 日付つきの版でない mini（速くて安い）。GPT の系列を優先し、その中でいちばん新しいもの。
 * なければ先頭
 */
export function pickDefaultOpenAiModel(models: OpenAiModel[]): string | null {
  const plain = models.filter((m) => !/\d{4}-\d{2}-\d{2}|preview|latest|nano|pro/i.test(m.id));
  const mini = plain.filter((m) => /mini/i.test(m.id));
  const base = mini.length ? mini : plain.length ? plain : models;
  const gpt = base.filter((m) => /^gpt-/i.test(m.id));
  const pool = gpt.length ? gpt : base;
  if (!pool.length) return null;
  return [...pool].sort((a, b) => b.id.localeCompare(a.id, 'en', { numeric: true }))[0].id;
}

/** 細かい設定を受け付けなかったモデル（次からは最小限の設定で送る） */
const minimalConfigModels = new Set<string>();

export interface OpenAiGenerateOptions {
  apiKey: string;
  model: string;
  signal: AbortSignal;
}

export async function openaiGenerate(
  req: GenerateRequest,
  opts: OpenAiGenerateOptions,
  onEvent: (e: GenerateEvent) => void,
  onToolCall?: (call: ToolCallInfo) => Promise<JsonValue>,
): Promise<GenerateResult> {
  const started = performance.now();
  let ttft: number | undefined;
  let promptTokens = 0;
  let outputTokens = 0;
  const { settings } = req;
  const reasoning = isReasoningModel(opts.model);
  const messages: Message[] = [
    ...(settings.systemPrompt ? [{ role: 'system' as const, content: settings.systemPrompt }] : []),
    ...[...req.history, req.message].map((t) =>
      t.role === 'assistant'
        ? { role: 'assistant' as const, content: t.text }
        : { role: 'user' as const, content: t.text },
    ),
  ];
  const tools =
    req.tools?.length && onToolCall
      ? req.tools.map((t) => ({
          type: 'function' as const,
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters?.properties
              ? t.parameters
              : { type: 'object', properties: {} },
          },
        }))
      : undefined;
  const maxTokens = settings.enableThinking
    ? Math.max(settings.maxOutputTokens, MIN_OUTPUT_TOKENS_WITH_THINKING)
    : reasoning
      ? Math.max(settings.maxOutputTokens, MIN_OUTPUT_TOKENS_REASONING)
      : settings.maxOutputTokens;

  const body = (minimal: boolean) => ({
    model: opts.model,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    max_completion_tokens: maxTokens,
    ...(tools && { tools }),
    // 推論モデルは temperature を受け付けない。考える深さは reasoning_effort で決める
    ...(!minimal && !reasoning && { temperature: settings.temperature }),
    ...(!minimal && reasoning && { reasoning_effort: settings.enableThinking ? 'high' : 'low' }),
  });

  const post = async (): Promise<Response> => {
    const send = (minimal: boolean) =>
      fetch(`${API}/chat/completions`, {
        method: 'POST',
        headers: headers(opts.apiKey),
        body: JSON.stringify(body(minimal)),
        signal: opts.signal,
      });
    const minimal = minimalConfigModels.has(opts.model);
    const res = await send(minimal);
    if (res.status === 400 && !minimal) {
      const retry = await send(true);
      if (retry.ok) minimalConfigModels.add(opts.model);
      return retry;
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

      let text = '';
      const calls: { id: string; name: string; args: string }[] = [];
      let finish: string | null | undefined;
      for await (const data of readSse(res.body)) {
        if (data === '[DONE]') break;
        let chunk: Chunk;
        try {
          chunk = JSON.parse(data) as Chunk;
        } catch {
          continue;
        }
        if (chunk.usage) {
          promptTokens += chunk.usage.prompt_tokens ?? 0;
          outputTokens += chunk.usage.completion_tokens ?? 0;
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        if (choice.finish_reason) finish = choice.finish_reason;
        for (const tc of choice.delta?.tool_calls ?? []) {
          // ツールの呼び出しは少しずつ届くので、番号ごとにつなげる
          const c = (calls[tc.index] ??= { id: '', name: '', args: '' });
          if (tc.id) c.id = tc.id;
          if (tc.function?.name) c.name += tc.function.name;
          if (tc.function?.arguments) c.args += tc.function.arguments;
        }
        const delta = choice.delta?.content;
        if (delta) {
          if (ttft === undefined) {
            ttft = performance.now() - started;
            onEvent({ type: 'first-token' });
          }
          text += delta;
          onEvent({ type: 'delta', text: delta });
        }
      }
      if (finish === 'content_filter' && !text) {
        throw new CloudError(
          'OpenAI が応答を止めました（内容のフィルター）。言い方を変えて試してください。',
          200,
          false,
        );
      }
      const ready = calls.filter((c) => c.name);
      if (!ready.length || !onToolCall) break;
      // ツールを実行して、結果を渡して続きを生成する
      messages.push({
        role: 'assistant',
        content: text || null,
        tool_calls: ready.map((c) => ({
          id: c.id,
          type: 'function',
          function: { name: c.name, arguments: c.args || '{}' },
        })),
      });
      for (const c of ready) {
        let args: Record<string, JsonValue> = {};
        try {
          args = c.args ? (JSON.parse(c.args) as Record<string, JsonValue>) : {};
        } catch {
          args = {};
        }
        onEvent({ type: 'tool-call', call: { name: c.name, arguments: args } });
        let result: JsonValue;
        let ok = true;
        try {
          result = await onToolCall({ name: c.name, arguments: args });
        } catch (e) {
          ok = false;
          result = { error: e instanceof Error ? e.message : String(e) };
        }
        onEvent({ type: 'tool-result', name: c.name, ok });
        messages.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(result) });
      }
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
      provider: `OpenAI（${opts.model}）`,
      totalMs,
      ttftMs: ttft,
      prefillTokens: promptTokens || undefined,
      decodeTokens: outputTokens || undefined,
      decodeTokensPerSec:
        outputTokens && decodeMs > 0 ? outputTokens / (decodeMs / 1000) : undefined,
    };
  }
}
