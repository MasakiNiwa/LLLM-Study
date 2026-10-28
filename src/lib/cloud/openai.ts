/**
 * OpenAI API（ユーザーが契約した API キー）への接続。ブラウザから直接呼び出す（サーバーを使わない）。
 *
 * - Chat Completions（POST /v1/chat/completions, stream: true）を使う。生成の本体は openaiCompat.ts（OpenRouter と共通）
 * - キーは Authorization ヘッダーで送る。SDK は使わず fetch だけで書く
 * - モデルの世代で受け付ける設定が違う（推論モデルは temperature を受け付けないなど）
 */
import { CloudError } from './errors';
import {
  authHeaders,
  createChatCompletions,
  networkError,
  readError,
  type ChatCompletionsOptions,
} from './openaiCompat';

export const OPENAI_ORIGIN = 'https://api.openai.com';
const API = `${OPENAI_ORIGIN}/v1`;

/** 推論モデルは考える分も出力の上限に数えるので、答えまで届くよう下限を設ける */
const MIN_OUTPUT_TOKENS_REASONING = 4096;
const MIN_OUTPUT_TOKENS_WITH_THINKING = 16384;

export interface OpenAiModel {
  id: string;
  displayName: string;
}

/** 推論（考える）モデル。temperature を受け付けず、考える分も出力の上限に数える */
export function isReasoningModel(model: string): boolean {
  return /^(o\d|gpt-5)/i.test(model);
}

/** エラーの応答を、利用者に伝わる文にする（キーは含めない） */
function toCloudError(s: number, code: string, detail: string): CloudError {
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
      `OpenAI API が要求を受け付けませんでした（400）${detail ? `: ${detail}` : ''}\n別のモデルを選ぶと直ることがあります。`,
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
    res = await fetch(`${API}/models`, { headers: authHeaders(apiKey), signal });
  } catch (e) {
    throw networkError('OpenAI API', e);
  }
  if (!res.ok) {
    const err = await readError(res);
    throw toCloudError(err.status, err.code, err.detail);
  }
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

export type OpenAiGenerateOptions = ChatCompletionsOptions;

export const openaiGenerate = createChatCompletions({
  label: 'OpenAI',
  apiBase: API,
  maxTokensField: 'max_completion_tokens',
  maxTokens: (model, settings) =>
    settings.enableThinking
      ? Math.max(settings.maxOutputTokens, MIN_OUTPUT_TOKENS_WITH_THINKING)
      : isReasoningModel(model)
        ? Math.max(settings.maxOutputTokens, MIN_OUTPUT_TOKENS_REASONING)
        : settings.maxOutputTokens,
  // 推論モデルは temperature を受け付けない。考える深さは reasoning_effort で決める
  params: (model, settings, minimal) => {
    if (minimal) return {};
    return isReasoningModel(model)
      ? { reasoning_effort: settings.enableThinking ? 'high' : 'low' }
      : { temperature: settings.temperature };
  },
  toError: toCloudError,
});
