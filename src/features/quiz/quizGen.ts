/**
 * AI 例文クイズの問題づくり。
 *
 * - どの項目を出すかはプログラムが決める（思い出せる確率が低い学習済みの項目から）
 * - AI は例文の穴埋め問題を JSON で作る
 * - アプリが形と内容（空欄が 1 つ・答えが元の語句と関係があるか）を検証し、採点もプログラムが行う
 */
import { distance } from 'fastest-levenshtein';
import { z } from 'zod';
import { normalizeAnswer } from '@/lib/srs/answerCheck';
import { extractJson } from '@/lib/packs/parse';
import type { PhraseItem, VocabItem } from '@/lib/packs/schema';

export type QuizSource = VocabItem | PhraseItem;

export interface QuizQuestion {
  itemKey: string;
  /** 元の語句 */
  target: string;
  /** 空欄（___）を 1 つ含む例文 */
  sentence: string;
  answer: string;
  translation?: string;
}

const QuizSchema = z.object({
  sentence: z.string().trim().min(5).max(300),
  answer: z.string().trim().min(1).max(80),
  translation: z.string().trim().max(300).optional(),
});

export function targetOf(item: QuizSource): string {
  return item.type === 'vocab' ? item.term : item.phrase;
}

export function quizPrompt(item: QuizSource): string {
  const target = targetOf(item);
  const meaning = item.type === 'vocab' ? item.meanings.join('、') : item.meaning;
  return [
    `「${target}」（意味: ${meaning}）を使った、自然で短い英語の例文を 1 つ作り、穴埋め問題にしてください。`,
    `- 例文の中の「${target}」（活用形でもよい）の部分を ___ にする（空欄は 1 つだけ）`,
    '- answer には空欄に入る語句をそのまま書く',
    '- translation には例文全体の日本語訳を書く',
    '- 教材にある例文とは違う、新しい場面の例文にする',
    '次の形の JSON だけを出力してください（説明文は不要）:',
    '{"sentence": "It ___ about an hour to get there.", "answer": "takes", "translation": "そこへ行くのに約 1 時間かかる。"}',
  ].join('\n');
}

/** 答えが元の語句（またはその活用形）と言えるか。ゆるめに判定する */
export function relatesToTarget(answer: string, target: string): boolean {
  const a = normalizeAnswer(answer);
  const t = normalizeAnswer(target);
  if (!a || !t) return false;
  if (a.includes(t) || t.includes(a)) return true;
  // 語尾の変化（pick up → picked up）や不規則変化（take → took）を許す。
  // go → went のように形が大きく変わるものは判定できないので、その問題は作り直す
  const head = Math.min(3, t.length);
  if (a.slice(0, head) === t.slice(0, head)) return true;
  return a[0] === t[0] && distance(a, t) <= Math.max(3, Math.floor(t.length / 2));
}

/** AI の出力から問題を取り出す。使えなければ理由（文字列） */
export function parseQuiz(text: string, item: QuizSource, itemKey: string): QuizQuestion | string {
  let data: unknown;
  try {
    data = JSON.parse(extractJson(text));
  } catch {
    return 'AI の出力を JSON として読み取れませんでした';
  }
  const r = QuizSchema.safeParse(data);
  if (!r.success) return 'AI の出力の形が正しくありません';
  const q = r.data;
  const blanks = q.sentence.match(/_{2,}/g) ?? [];
  if (blanks.length !== 1) return '例文の空欄が 1 つではありません';
  const target = targetOf(item);
  if (!relatesToTarget(q.answer, target)) return '答えが出題した語句と合っていません';
  return {
    itemKey,
    target,
    sentence: q.sentence.replace(/_{2,}/, '___'),
    answer: q.answer,
    translation: q.translation,
  };
}
