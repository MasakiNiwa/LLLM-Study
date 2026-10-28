/**
 * Claude（Anthropic API・ユーザーが契約した API キー）への接続。ブラウザから直接呼び出す（サーバーを使わない）。
 *
 * - Messages API（POST /v1/messages, stream: true）。キーは x-api-key ヘッダーで送る。SDK は使わず fetch だけで書く
 * - ブラウザから直接呼ぶには anthropic-dangerous-direct-browser-access: true が要る（キーはユーザー自身のもの）
 * - 考える過程は thinking（adaptive・要約を表示）、深さは output_config.effort で決める。temperature は送らない
 * - ツール: tool_use を受け取ったら実行し、tool_result を 1 つのユーザーの発話にまとめて返す。
 *   モデルが返した部分（考える過程と署名を含む）はそのまま履歴に戻す
 * - 400 で断られたら最小限の設定（考える設定・深さなし）で送り直し、そのモデルでは次からも最小限で送る
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

export const ANTHROPIC_ORIGIN = 'https://api.anthropic.com';
const API = `${ANTHROPIC_ORIGIN}/v1`;
const API_VERSION = '2026-10-21';

const MAX_TOOL_ROUNDS = 5;
/** 考える分も出力の上限に数えるので、答えまで届くよう下限を設ける */
const MIN_OUTPUT_TOKENS = 4096;
const MIN_OUTPUT_TOKENS_WITH_THINKING = 16384;

export interface AnthropicModel {
  id: string;
  displayName: string;
}

/** モデルが返す部分。履歴に戻すときはそのまま送る */
type Block =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature: string }
  | { type: 'redacted_thinking'; data: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, JsonValue> };

type Message =
  | { role: 'user'; content: string | ToolResult[] }
  | { role: 'assistant'; content: string | Block[] };

interface ToolResult {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

interface StreamEvent {
  type: string;
  index?: number;
  message?: { usage?: { input_tokens?: number } };
  content_block?: {
    type: string;
    text?: string;
    thinking?: string;
    signature?: string;
    data?: string;
    id?: string;
    name?: string;
  };
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    signature?: string;
    partial_json?: string;
    stop_reason?: string | null;
  };
  usage?: { output_tokens?: number };
  error?: { type?: string; message?: string };
}

function headers(apiKey: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  };
}

function networkError(e: unknown): Error {
  if (e instanceof DOMException && e.name === 'AbortError') return e;
  return new CloudError(
    'Anthropic API に接続できませんでした（ネットワークを確かめてください）。',
    0,
    true,
  );
}

/** エラーを、利用者に伝わる文にする（キーは含めない） */
function toCloudError(s: number, type: string, detail: string): CloudError {
  if (s === 401)
    return new CloudError(
      'API キーが正しくありません。キーを確かめて登録し直してください。',
      s,
      false,
    );
  if (s === 403)
    return new CloudError(
      `このキーでは使えません（キーの権限・ワークスペースを確かめてください）。${detail ? `\n${detail}` : ''}`,
      s,
      false,
    );
  if (s === 404)
    return new CloudError(
      'このモデルは使えません（名前が違うか、提供が終わっています）。別のモデルを選んでください。',
      s,
      false,
    );
  if (/credit balance/i.test(detail) || type === 'billing_error')
    return new CloudError(
      'クレジットの残高が足りません。Anthropic の Console の Billing を確かめてください。',
      s,
      false,
    );
  if (s === 429)
    return new CloudError('短い時間に使いすぎました。少し待ってから使ってください。', s, true);
  if (s === 529 || type === 'overloaded_error')
    return new CloudError('Claude が混み合っています。少し待ってから使ってください。', s, true);
  if (s >= 500)
    return new CloudError(`Anthropic のサーバーが応答できませんでした（${s}）。`, s, true);
  if (s === 400)
    return new CloudError(
      `Anthropic API が要求を受け付けませんでした（400）${detail ? `: ${detail}` : ''}\n別のモデルを選ぶと直ることがあります。`,
      s,
      false,
    );
  return new CloudError(`Anthropic API のエラー（${s}）${detail ? `: ${detail}` : ''}`, s, false);
}

async function readError(res: Response): Promise<CloudError> {
  let detail = '';
  let type = '';
  try {
    const body = (await res.json()) as { error?: { type?: string; message?: string } };
    detail = body.error?.message ?? '';
    type = body.error?.type ?? '';
  } catch {
    // 本文が JSON でない
  }
  return toCloudError(res.status, type, detail);
}

/** 使えるモデルの一覧（キーの確認にも使う。トークンを消費しない） */
export async function listAnthropicModels(
  apiKey: string,
  signal?: AbortSignal,
): Promise<AnthropicModel[]> {
  let res: Response;
  try {
    res = await fetch(`${API}/models?limit=100`, { headers: headers(apiKey), signal });
  } catch (e) {
    throw networkError(e);
  }
  if (!res.ok) throw await readError(res);
  const body = (await res.json()) as { data?: { id: string; display_name?: string }[] };
  // 新しいものから順に返る
  return (body.data ?? []).map((m) => ({ id: m.id, displayName: m.display_name || m.id }));
}

/** 既定のモデル: いちばん新しい Haiku（速くて安い）。なければ Sonnet、それもなければ先頭 */
export function pickDefaultAnthropicModel(models: AnthropicModel[]): string | null {
  return (
    models.find((m) => /haiku/i.test(m.id))?.id ??
    models.find((m) => /sonnet/i.test(m.id))?.id ??
    models[0]?.id ??
    null
  );
}

/** 細かい設定を受け付けなかったモデル（次からは最小限の設定で送る） */
const minimalConfigModels = new Set<string>();

export interface AnthropicGenerateOptions {
  apiKey: string;
  model: string;
  signal: AbortSignal;
}

export async function anthropicGenerate(
  req: GenerateRequest,
  opts: AnthropicGenerateOptions,
  onEvent: (e: GenerateEvent) => void,
  onToolCall?: (call: ToolCallInfo) => Promise<JsonValue>,
): Promise<GenerateResult> {
  const started = performance.now();
  let ttft: number | undefined;
  let promptTokens = 0;
  let outputTokens = 0;
  const { settings } = req;
  const messages: Message[] = [...req.history, req.message].map((t) =>
    t.role === 'assistant'
      ? { role: 'assistant' as const, content: t.text }
      : { role: 'user' as const, content: t.text },
  );
  const tools =
    req.tools?.length && onToolCall
      ? req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters?.properties
            ? t.parameters
            : { type: 'object', properties: {} },
        }))
      : undefined;
  const maxTokens = Math.max(
    settings.maxOutputTokens,
    settings.enableThinking ? MIN_OUTPUT_TOKENS_WITH_THINKING : MIN_OUTPUT_TOKENS,
  );

  const body = (minimal: boolean) => ({
    model: opts.model,
    max_tokens: maxTokens,
    stream: true,
    ...(settings.systemPrompt && { system: settings.systemPrompt }),
    messages,
    ...(tools && { tools }),
    // 考える過程: オンなら要約を表示してじっくり、オフなら速さ優先（止められないモデルもあるので深さで決める）
    ...(!minimal &&
      settings.enableThinking && { thinking: { type: 'adaptive', display: 'summarized' } }),
    ...(!minimal && { output_config: { effort: settings.enableThinking ? 'high' : 'low' } }),
  });

  const post = async (): Promise<Response> => {
    const send = (minimal: boolean) =>
      fetch(`${API}/messages`, {
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
      if (!res.ok || !res.body) throw await readError(res);

      const blocks: Block[] = [];
      /** ツールの引数は JSON の断片で届くので、ブロックごとにつなげる */
      const partial = new Map<number, string>();
      let stop: string | null | undefined;
      let text = '';
      const first = () => {
        if (ttft === undefined) {
          ttft = performance.now() - started;
          onEvent({ type: 'first-token' });
        }
      };
      for await (const data of readSse(res.body)) {
        let ev: StreamEvent;
        try {
          ev = JSON.parse(data) as StreamEvent;
        } catch {
          continue;
        }
        if (ev.type === 'error') {
          const type = ev.error?.type ?? '';
          throw toCloudError(
            type === 'overloaded_error' ? 529 : 500,
            type,
            ev.error?.message ?? '',
          );
        }
        if (ev.type === 'message_start') {
          promptTokens += ev.message?.usage?.input_tokens ?? 0;
        } else if (ev.type === 'content_block_start' && ev.index !== undefined) {
          const b = ev.content_block;
          if (b?.type === 'text') blocks[ev.index] = { type: 'text', text: b.text ?? '' };
          else if (b?.type === 'thinking')
            blocks[ev.index] = {
              type: 'thinking',
              thinking: b.thinking ?? '',
              signature: b.signature ?? '',
            };
          else if (b?.type === 'redacted_thinking')
            blocks[ev.index] = { type: 'redacted_thinking', data: b.data ?? '' };
          else if (b?.type === 'tool_use')
            blocks[ev.index] = { type: 'tool_use', id: b.id ?? '', name: b.name ?? '', input: {} };
        } else if (ev.type === 'content_block_delta' && ev.index !== undefined) {
          const b = blocks[ev.index];
          const d = ev.delta;
          if (d?.type === 'text_delta' && d.text && b?.type === 'text') {
            first();
            b.text += d.text;
            text += d.text;
            onEvent({ type: 'delta', text: d.text });
          } else if (d?.type === 'thinking_delta' && d.thinking && b?.type === 'thinking') {
            first();
            b.thinking += d.thinking;
            onEvent({ type: 'delta', text: d.thinking, channel: 'thought' });
          } else if (d?.type === 'signature_delta' && d.signature && b?.type === 'thinking') {
            b.signature += d.signature;
          } else if (d?.type === 'input_json_delta' && d.partial_json) {
            partial.set(ev.index, (partial.get(ev.index) ?? '') + d.partial_json);
          }
        } else if (ev.type === 'content_block_stop' && ev.index !== undefined) {
          const b = blocks[ev.index];
          if (b?.type === 'tool_use') {
            try {
              const json = partial.get(ev.index);
              b.input = json ? (JSON.parse(json) as Record<string, JsonValue>) : {};
            } catch {
              b.input = {};
            }
          }
        } else if (ev.type === 'message_delta') {
          if (ev.delta?.stop_reason) stop = ev.delta.stop_reason;
          outputTokens += ev.usage?.output_tokens ?? 0;
        }
      }
      if (stop === 'refusal' && !text) {
        throw new CloudError(
          'Claude が応答を控えました。言い方を変えて試してください。',
          200,
          false,
        );
      }
      const calls = blocks.filter(
        (b): b is Extract<Block, { type: 'tool_use' }> => b?.type === 'tool_use' && !!b.name,
      );
      if (stop !== 'tool_use' || !calls.length || !onToolCall) break;
      // ツールを実行して、結果をまとめて返し、続きを生成する
      messages.push({ role: 'assistant', content: blocks.filter(Boolean) });
      const results: ToolResult[] = [];
      for (const c of calls) {
        onEvent({ type: 'tool-call', call: { name: c.name, arguments: c.input } });
        let result: JsonValue;
        let ok = true;
        try {
          result = await onToolCall({ name: c.name, arguments: c.input });
        } catch (e) {
          ok = false;
          result = { error: e instanceof Error ? e.message : String(e) };
        }
        onEvent({ type: 'tool-result', name: c.name, ok });
        results.push({
          type: 'tool_result',
          tool_use_id: c.id,
          content: JSON.stringify(result),
          ...(!ok && { is_error: true }),
        });
      }
      messages.push({ role: 'user', content: results });
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
      provider: `Claude（${opts.model}）`,
      totalMs,
      ttftMs: ttft,
      prefillTokens: promptTokens || undefined,
      decodeTokens: outputTokens || undefined,
      decodeTokensPerSec:
        outputTokens && decodeMs > 0 ? outputTokens / (decodeMs / 1000) : undefined,
    };
  }
}
