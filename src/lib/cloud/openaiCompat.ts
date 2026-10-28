/**
 * OpenAI 互換の Chat Completions（POST {apiBase}/chat/completions, stream: true）で生成する共通部分。
 * OpenAI（openai.ts）と OpenRouter（openrouter.ts）が、送信先・設定の作り方・エラーの言い換えだけを変えて使う。
 *
 * - 端末内のモデル・Gemini と同じ GenerateRequest / GenerateEvent を使う
 * - ツールの呼び出しはストリームで少しずつ届くので、番号（index）ごとにつなげてから実行する
 * - 400 で断られたら最小限の設定で送り直し、そのモデルでは次からも最小限で送る
 */
import type {
  ConversationSettings,
  GenerateEvent,
  GenerateRequest,
  GenerateResult,
  JsonValue,
  ToolCallInfo,
} from '@/lib/llm/types';
import { CloudError } from './errors';
import { readSse } from './sse';

const MAX_TOOL_ROUNDS = 5;

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
      /** 考える過程（OpenRouter が返す） */
      reasoning?: string | null;
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
  /** ストリームの途中で届くエラー（OpenRouter） */
  error?: { message?: string; code?: number | string };
}

export interface ChatCompletionsConfig {
  /** 画面・エラーに出す名前 */
  label: string;
  /** 例: https://api.openai.com/v1 */
  apiBase: string;
  extraHeaders?: Record<string, string>;
  /** 出力の上限の項目名（OpenAI は max_completion_tokens、OpenRouter は max_tokens） */
  maxTokensField: 'max_completion_tokens' | 'max_tokens';
  /** 出力の上限（考えるモデルの下限などを足したもの） */
  maxTokens: (model: string, settings: ConversationSettings) => number;
  /** 温度・考える深さなどの設定。minimal なら最小限（受け付けられなかったとき） */
  params: (
    model: string,
    settings: ConversationSettings,
    minimal: boolean,
  ) => Record<string, unknown>;
  /** エラーの応答を、利用者に伝わる文にする（キーは含めない） */
  toError: (status: number, code: string, detail: string) => CloudError;
  /** ツールに対応していないモデルと分かる応答か（そのときはツールなしで送り直す） */
  isToolsUnsupported?: (status: number, detail: string) => boolean;
}

export interface ChatCompletionsOptions {
  apiKey: string;
  model: string;
  signal: AbortSignal;
}

export function authHeaders(apiKey: string, extra?: Record<string, string>): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}`, ...extra };
}

export function networkError(label: string, e: unknown): Error {
  if (e instanceof DOMException && e.name === 'AbortError') return e;
  return new CloudError(
    `${label} に接続できませんでした（ネットワークを確かめてください）。`,
    0,
    true,
  );
}

/** エラーの応答から、状態コード・エラーの種類・説明を取り出す */
export async function readError(
  res: Response,
): Promise<{ status: number; code: string; detail: string }> {
  let detail = '';
  let code = '';
  try {
    const body = (await res.json()) as {
      error?: { message?: string; code?: string | number; type?: string };
    };
    detail = body.error?.message ?? '';
    code = String(body.error?.code ?? body.error?.type ?? '');
  } catch {
    // 本文が JSON でない
  }
  return { status: res.status, code, detail };
}

export function createChatCompletions(config: ChatCompletionsConfig) {
  /** 細かい設定を受け付けなかったモデル（次からは最小限の設定で送る） */
  const minimalConfigModels = new Set<string>();
  /** ツールに対応していないモデル（次からはツールなしで送る） */
  const noToolModels = new Set<string>();

  return async function generate(
    req: GenerateRequest,
    opts: ChatCompletionsOptions,
    onEvent: (e: GenerateEvent) => void,
    onToolCall?: (call: ToolCallInfo) => Promise<JsonValue>,
  ): Promise<GenerateResult> {
    const started = performance.now();
    let ttft: number | undefined;
    let promptTokens = 0;
    let outputTokens = 0;
    const { settings } = req;
    const messages: Message[] = [
      ...(settings.systemPrompt
        ? [{ role: 'system' as const, content: settings.systemPrompt }]
        : []),
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

    const body = (minimal: boolean, withTools: boolean) => ({
      model: opts.model,
      messages,
      stream: true,
      stream_options: { include_usage: true },
      [config.maxTokensField]: config.maxTokens(opts.model, settings),
      ...(tools && withTools && { tools }),
      ...config.params(opts.model, settings, minimal),
    });

    const post = async (): Promise<Response> => {
      const send = (minimal: boolean, withTools: boolean) =>
        fetch(`${config.apiBase}/chat/completions`, {
          method: 'POST',
          headers: authHeaders(opts.apiKey, config.extraHeaders),
          body: JSON.stringify(body(minimal, withTools)),
          signal: opts.signal,
        });
      const minimal = minimalConfigModels.has(opts.model);
      const withTools = !noToolModels.has(opts.model);
      let res = await send(minimal, withTools);
      if (res.status === 400 && !minimal) {
        const retry = await send(true, withTools);
        if (retry.ok) minimalConfigModels.add(opts.model);
        res = retry;
      }
      if (!res.ok && tools && withTools && config.isToolsUnsupported) {
        // ツールを使えないモデルなら、ツールなしで答えてもらう
        const err = await readError(res.clone());
        if (config.isToolsUnsupported(err.status, err.detail)) {
          const retry = await send(minimalConfigModels.has(opts.model), false);
          if (retry.ok) noToolModels.add(opts.model);
          return retry;
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
          throw networkError(config.label, e);
        }
        if (!res.ok || !res.body) {
          const err = await readError(res);
          throw config.toError(err.status, err.code, err.detail);
        }

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
          if (chunk.error) {
            const status = typeof chunk.error.code === 'number' ? chunk.error.code : 500;
            throw config.toError(status, String(chunk.error.code ?? ''), chunk.error.message ?? '');
          }
          if (chunk.usage) {
            promptTokens += chunk.usage.prompt_tokens ?? 0;
            outputTokens += chunk.usage.completion_tokens ?? 0;
          }
          const choice = chunk.choices?.[0];
          if (!choice) continue;
          if (choice.finish_reason) finish = choice.finish_reason;
          for (const tc of choice.delta?.tool_calls ?? []) {
            const c = (calls[tc.index] ??= { id: '', name: '', args: '' });
            if (tc.id) c.id = tc.id;
            if (tc.function?.name) c.name += tc.function.name;
            if (tc.function?.arguments) c.args += tc.function.arguments;
          }
          const thought = choice.delta?.reasoning;
          if (thought) {
            if (ttft === undefined) {
              ttft = performance.now() - started;
              onEvent({ type: 'first-token' });
            }
            onEvent({ type: 'delta', text: thought, channel: 'thought' });
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
            `${config.label} が応答を止めました（内容のフィルター）。言い方を変えて試してください。`,
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
        provider: `${config.label}（${opts.model}）`,
        totalMs,
        ttftMs: ttft,
        prefillTokens: promptTokens || undefined,
        decodeTokens: outputTokens || undefined,
        decodeTokensPerSec:
          outputTokens && decodeMs > 0 ? outputTokens / (decodeMs / 1000) : undefined,
      };
    }
  };
}
