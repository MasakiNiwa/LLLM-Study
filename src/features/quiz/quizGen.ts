/**
 * AI 例文クイズの問題づくり。
 *
 * - どの項目を出すかはプログラムが決める（思い出せる確率が低い学習済みの項目から）
 * - AI は例文の穴埋め問題を JSON で作る
 * - アプリが形と内容（空欄が 1 つ・答えが元の語句と関係があるか）を検証し、採点もプログラムが行う
 */
import { z } from 'zod';
import { checkAnswer, normalizeAnswer, type AnswerCheck } from '@/lib/srs/answerCheck';
import { languageName } from '@/lib/speech/lang';
import { extractJson } from '@/lib/packs/parse';
import { isEnglishLike, isInflectionOf } from '@/lib/packs/inflection';
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
  /** 教材の学ぶ言語（読み上げ用） */
  lang?: string;
}

const QuizSchema = z.object({
  sentence: z.string().trim().min(5).max(300),
  answer: z.string().trim().min(1).max(80),
  translation: z.string().trim().max(300).optional(),
});

export function targetOf(item: QuizSource): string {
  return item.type === 'vocab' ? item.term : item.phrase;
}

/** lang: 教材の学ぶ言語（BCP 47。省略時は英語） */
export function quizPrompt(item: QuizSource, lang?: string): string {
  const target = targetOf(item);
  const meaning = item.type === 'vocab' ? item.meanings.join('、') : item.meaning;
  return [
    `「${target}」（意味: ${meaning}）を使った、自然で短い${languageName(lang)}の例文を 1 つ作り、穴埋め問題にしてください。`,
    `- 例文の中の「${target}」（活用形でもよい）の部分を ___ にする（空欄は 1 つだけ）`,
    '- answer には空欄に入る語句をそのまま書く',
    '- translation には例文全体の日本語訳を書く',
    '- 教材にある例文とは違う、新しい場面の例文にする',
    '次の形の JSON だけを出力してください（説明文は不要）:',
    '{"sentence": "It ___ about an hour to get there.", "answer": "takes", "translation": "そこへ行くのに約 1 時間かかる。"}',
  ].join('\n');
}

/**
 * 答えが元の語句（またはその活用形）と言えるか。
 * - 教材の forms（活用形の指定）にあれば正しい
 * - 英語は規則変化と主な不規則動詞から作った活用形と照らし合わせる（take → takes / took / taken）
 * - それ以外の言語は、語幹（最後の 1 文字を除いた部分）が同じなら正しい（食べる → 食べた）
 * 判定できない形（教材にない不規則変化など）はその問題を作り直す。
 */
export function relatesToTarget(answer: string, target: string, forms: string[] = []): boolean {
  const a = normalizeAnswer(answer);
  const t = normalizeAnswer(target);
  if (!a || !t) return false;
  if (a === t) return true;
  if (forms.some((f) => normalizeAnswer(f) === a)) return true;
  if (isEnglishLike(t) && isEnglishLike(a)) return isInflectionOf(a, t, forms);
  if (a.includes(t)) return true;
  const stem = t.length >= 2 ? t.slice(0, -1) : t;
  return a.startsWith(stem) && a.length <= t.length + 3;
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
  if (!relatesToTarget(q.answer, target, item.forms)) return '答えが出題した語句と合っていません';
  return {
    itemKey,
    target,
    sentence: q.sentence.replace(/_{2,}/, '___'),
    answer: q.answer,
    translation: q.translation,
  };
}

export interface QuizGrade {
  check: AnswerCheck;
  /** 単語は合っているが、文に合う形（活用形）になっていない */
  baseForm: boolean;
}

/**
 * クイズの答えを採点する。正解は空欄に実際に入る形（question.answer）だけ。
 * 元の形（例: went が必要なところに go）を書いたときは「惜しい」にして、形を直すよう伝える。
 */
export function gradeQuiz(
  input: string,
  question: Pick<QuizQuestion, 'answer' | 'target'>,
): QuizGrade {
  const check = checkAnswer(input, { accepted: [question.answer] });
  if (check.verdict === 'correct') return { check, baseForm: false };
  const typed = normalizeAnswer(input);
  if (typed && typed === normalizeAnswer(question.target)) {
    return {
      check: { verdict: 'close', expected: question.answer, recommended: 2 },
      baseForm: true,
    };
  }
  return { check, baseForm: false };
}
