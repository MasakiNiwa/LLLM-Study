/**
 * プログラムの答え合わせで「不正解・惜しい」になった答えを、AI に補足判定してもらう。
 * 言い換え・別の正しい訳など、文字の比較では判定できないものを拾うため。
 *
 * AI には JSON だけで答えてもらい、アプリがその形を検証してから使う（構造化データでの連携）。
 * 最終的な評価はユーザーが選び、記録はアルゴリズム（FSRS）が行う。
 */
import { z } from 'zod';
import { extractJson } from '@/lib/packs/parse';

export const JudgeSchema = z.object({
  verdict: z.enum(['correct', 'close', 'wrong']),
  comment: z.string().trim().min(1).max(300),
});

export type JudgeResult = z.infer<typeof JudgeSchema>;

export function judgePrompt(
  cardJson: Record<string, unknown>,
  userAnswer: string,
  expected: string,
): string {
  return [
    'ユーザーが学習カードの答えを入力しました。意味として正しいかを判定してください。',
    '言い換え・別の自然な訳・語順の違いなど、意味が合っていれば correct、',
    '惜しい（一部だけ合っている・つづりの小さな誤り）なら close、意味が違えば wrong です。',
    '',
    '<card>',
    JSON.stringify(cardJson),
    '</card>',
    `正解の例: ${expected}`,
    `ユーザーの答え: ${userAnswer}`,
    '',
    '次の JSON だけを出力してください（説明文やコードブロックは不要）:',
    '{"verdict": "correct" | "close" | "wrong", "comment": "あなたの性格で、理由をひとこと（60 文字以内）"}',
  ].join('\n');
}

/** AI の出力から判定結果を取り出す。形が合わなければ null */
export function parseJudge(text: string): JudgeResult | null {
  try {
    const r = JudgeSchema.safeParse(JSON.parse(extractJson(text)));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
