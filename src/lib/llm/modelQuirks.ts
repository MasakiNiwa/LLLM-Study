/**
 * モデルごとの癖への対応。
 *
 * Qwen3 は会話設定の enable_thinking では思考を止められないため、
 * 公式の「ソフトスイッチ」（ユーザー発話末尾の /no_think）で切り替える。
 */
export function userMessageSuffix(modelName: string | undefined, enableThinking: boolean): string {
  if (!enableThinking && modelName && /qwen3/i.test(modelName)) return ' /no_think';
  return '';
}
