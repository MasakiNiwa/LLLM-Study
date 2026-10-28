/**
 * OpenRouter（1 つのキーで多くの会社のモデルを使える API）への接続。ブラウザから直接呼び出す。
 *
 * - 生成は OpenAI 互換の Chat Completions（openaiCompat.ts を共通で使う）
 * - モデルの一覧はキーなしで取れる（料金・ツール対応・考える過程の対応などの情報つき）。キーは /key で確かめる
 * - 考える過程は reasoning で頼み、delta.reasoning で受け取る
 * - ツールに対応していないモデルは、ツールなしで送り直す
 */
import { CloudError } from './errors';
import {
  authHeaders,
  createChatCompletions,
  networkError,
  readError,
  type ChatCompletionsOptions,
} from './openaiCompat';

export const OPENROUTER_ORIGIN = 'https://openrouter.ai';
const API = `${OPENROUTER_ORIGIN}/api/v1`;

const MIN_OUTPUT_TOKENS = 4096;
const MIN_OUTPUT_TOKENS_WITH_THINKING = 16384;

export interface OpenRouterModel {
  id: string;
  displayName: string;
  /** 提供元（id の「/」より前。例: google） */
  vendor: string;
  contextLength: number;
  /** 100 万トークンあたりの料金（USD）。不明なら null */
  promptPrice: number | null;
  completionPrice: number | null;
  free: boolean;
  /** アプリの機能（ツール）を呼び出せるか */
  tools: boolean;
  /** 考える過程に対応しているか */
  reasoning: boolean;
}

/** OpenRouter に、どのアプリからの利用かを伝える（任意の項目。キーとは関係ない） */
function appHeaders(): Record<string, string> {
  const url = typeof location === 'undefined' ? '' : `${location.origin}${location.pathname}`;
  return { ...(url && { 'HTTP-Referer': url }), 'X-Title': 'LLLM Study' };
}

function toCloudError(s: number, _code: string, detail: string): CloudError {
  const more = detail ? `\n${detail}` : '';
  if (s === 401)
    return new CloudError(
      'API キーが正しくありません。キーを確かめて登録し直してください。',
      s,
      false,
    );
  if (s === 402)
    return new CloudError(
      'OpenRouter のクレジットが足りません。Credits を確かめるか、無料のモデル（:free）を選んでください。',
      s,
      false,
    );
  if (s === 403)
    return new CloudError(`OpenRouter が要求を受け付けませんでした（403）。${more}`, s, false);
  if (s === 404)
    return new CloudError(
      `このモデルは使えません（いま提供されていないか、名前が違います）。別のモデルを選んでください。${more}`,
      s,
      false,
    );
  if (s === 408 || s === 429 || s >= 500)
    return new CloudError(
      s === 429
        ? '短い時間に使いすぎました（無料のモデルは回数の上限が小さめです）。少し待つか、別のモデルを選んでください。'
        : `OpenRouter のモデルが応答できませんでした（${s}）。少し待つか、別のモデルを選んでください。`,
      s,
      true,
    );
  if (s === 400)
    return new CloudError(
      `OpenRouter が要求を受け付けませんでした（400）${detail ? `: ${detail}` : ''}\n別のモデルを選ぶと直ることがあります。`,
      s,
      false,
    );
  return new CloudError(`OpenRouter のエラー（${s}）${detail ? `: ${detail}` : ''}`, s, false);
}

interface RawModel {
  id?: unknown;
  name?: unknown;
  context_length?: unknown;
  pricing?: { prompt?: unknown; completion?: unknown } | null;
  supported_parameters?: unknown;
  architecture?: { output_modalities?: unknown } | null;
}

const perMillion = (v: unknown): number | null => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  return Number.isFinite(n) && n >= 0 ? n * 1_000_000 : null;
};

/** API の応答をアプリで使う形にする。形のおかしい項目・文章を出さないモデルは捨てる */
export function parseOpenRouterModels(json: unknown): OpenRouterModel[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const out: OpenRouterModel[] = [];
  for (const raw of data as RawModel[]) {
    if (typeof raw?.id !== 'string' || !raw.id) continue;
    const outputs = raw.architecture?.output_modalities;
    if (Array.isArray(outputs) && !outputs.includes('text')) continue;
    const params = Array.isArray(raw.supported_parameters)
      ? raw.supported_parameters.filter((p): p is string => typeof p === 'string')
      : [];
    const promptPrice = perMillion(raw.pricing?.prompt);
    const completionPrice = perMillion(raw.pricing?.completion);
    out.push({
      id: raw.id,
      displayName: typeof raw.name === 'string' && raw.name ? raw.name : raw.id,
      vendor: raw.id.includes('/') ? raw.id.split('/')[0] : 'other',
      contextLength: typeof raw.context_length === 'number' ? raw.context_length : 0,
      promptPrice,
      completionPrice,
      free: raw.id.endsWith(':free') || (promptPrice === 0 && completionPrice === 0),
      tools: params.includes('tools'),
      reasoning: params.includes('reasoning') || params.includes('include_reasoning'),
    });
  }
  return out;
}

/** キーを確かめてから、モデルの一覧を取る（一覧そのものはキーなしで取れる） */
export async function listOpenRouterModels(
  apiKey: string,
  signal?: AbortSignal,
): Promise<OpenRouterModel[]> {
  let res: Response;
  try {
    res = await fetch(`${API}/key`, { headers: authHeaders(apiKey), signal });
    if (res.ok) res = await fetch(`${API}/models`, { signal });
  } catch (e) {
    throw networkError('OpenRouter', e);
  }
  if (!res.ok) {
    const err = await readError(res);
    throw toCloudError(err.status, err.code, err.detail);
  }
  return parseOpenRouterModels(await res.json());
}

/**
 * 既定のモデル: ツールを使えて、よく知られた会社の速くて安いもの（mini・flash・haiku）のうち、いちばん安いもの。
 * 無料のモデルは回数の上限が小さく入れ替わりも多いので、既定にはしない
 */
export function pickDefaultOpenRouterModel(models: OpenRouterModel[]): string | null {
  const usable = models.filter((m) => m.tools && !m.free);
  const light = usable.filter(
    (m) =>
      /^(openai|google|anthropic)\//.test(m.id) &&
      /mini|flash|haiku/i.test(m.id) &&
      !/preview|exp|nano|image|audio/i.test(m.id),
  );
  const pool = light.length ? light : usable.length ? usable : models;
  if (!pool.length) return null;
  const price = (m: OpenRouterModel) => m.completionPrice ?? Number.POSITIVE_INFINITY;
  return [...pool].sort((a, b) => price(a) - price(b))[0].id;
}

export type OpenRouterGenerateOptions = ChatCompletionsOptions;

export const openrouterGenerate = createChatCompletions({
  label: 'OpenRouter',
  apiBase: API,
  get extraHeaders() {
    return appHeaders();
  },
  maxTokensField: 'max_tokens',
  maxTokens: (_model, settings) =>
    Math.max(
      settings.maxOutputTokens,
      settings.enableThinking ? MIN_OUTPUT_TOKENS_WITH_THINKING : MIN_OUTPUT_TOKENS,
    ),
  // 対応していない設定は OpenRouter が無視する。考える過程は、オンのときだけ頼む
  params: (_model, settings, minimal) =>
    minimal
      ? {}
      : {
          temperature: settings.temperature,
          ...(settings.enableThinking && { reasoning: { effort: 'high' } }),
        },
  toError: toCloudError,
  isToolsUnsupported: (status, detail) => status === 404 && /tool/i.test(detail),
});

/** 表示用の短い名前（例: google/gemini-2.5-flash → gemini-2.5-flash） */
export const shortOpenRouterModel = (id: string) =>
  id.includes('/') ? id.slice(id.indexOf('/') + 1) : id;

/** 料金の表示（100 万トークンあたり 入力 / 出力） */
export function formatOpenRouterPrice(m: OpenRouterModel): string {
  if (m.free) return '無料';
  if (m.promptPrice === null || m.completionPrice === null) return '料金不明';
  const f = (n: number) => (n >= 10 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n.toFixed(2));
  return `$${f(m.promptPrice)} / $${f(m.completionPrice)}`;
}
