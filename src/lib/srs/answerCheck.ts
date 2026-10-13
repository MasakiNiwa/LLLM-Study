/**
 * 入力した答えの答え合わせ（プログラムが判定する）。
 *
 * - 大文字小文字・前後の空白・句読点・引用符の違いは無視する
 * - 少しのつづり間違い（編集距離が短い）は「惜しい」とする
 * - 判定に応じて、すすめる評価（正解→「正解」、惜しい→「難しい」、不正解→「もう一度」）を返す
 * 言い換えなど、プログラムで判定しきれないものは AI に補足してもらう（features/ai/judge.ts）
 */
import { distance } from 'fastest-levenshtein';
import type { GradeValue } from '@/lib/db/types';

export type AnswerVerdict = 'correct' | 'close' | 'wrong';

export interface AnswerCheck {
  verdict: AnswerVerdict;
  /** 一番近かった正解 */
  expected: string;
  recommended: GradeValue;
}

/** 比較用に正規化する */
export function normalizeAnswer(s: string): string {
  return (
    s
      .normalize('NFKC')
      .toLowerCase()
      // 数字の桁区切り（1,000）は区切らない（句読点として空白にしない）
      .replace(/(\d),(?=\d{3}(?!\d))/g, '$1')
      .replace(/[‘’`´]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/[.,!?;:"、。！？「」『』（）()]/g, ' ')
      .replace(/\s+/g, ' ')
      // 日本語・中国語などの文字の前後の空白は区別しない（「5 冊」と「5冊」を同じにする）
      .replace(/ ?([\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff〜]) ?/g, '$1')
      // 記号の前後の空白も区別しない（「(x + 2)(x - 3)」と「(x+2)(x-3)」、「25 π」と「25π」）
      .replace(/ ?([^\p{L}\p{N}' ]|[πθ]) ?/gu, '$1')
      .trim()
  );
}

/** 比較用の形。句読点だけの答え（「??」「?.」など）は、句読点を消すと空になるので空白だけを詰める */
function comparable(s: string): string {
  return normalizeAnswer(s) || s.normalize('NFKC').replace(/\s+/g, '');
}

/** 1 つの答えを、候補のどれかと比べる */
function checkOne(
  input: string,
  candidates: string[],
): { verdict: AnswerVerdict; expected: string } {
  const a = comparable(input);
  let best = { verdict: 'wrong' as AnswerVerdict, expected: candidates[0] ?? '', d: Infinity };
  for (const c of candidates) {
    const b = comparable(c);
    if (!b) continue;
    if (a === b) return { verdict: 'correct', expected: c };
    const d = distance(a, b);
    // 短い語ほど厳しく（3 文字なら 0、10 文字なら 1、20 文字なら 3 まで）
    const allowed = Math.floor(b.length * 0.15);
    const verdict: AnswerVerdict = a.length > 0 && d <= allowed ? 'close' : 'wrong';
    if (d < best.d) best = { verdict, expected: c, d };
  }
  return { verdict: best.verdict, expected: best.expected };
}

const RECOMMENDED: Record<AnswerVerdict, GradeValue> = { correct: 3, close: 2, wrong: 1 };

/**
 * accepted: 正解の候補（どれか 1 つに合えばよい）
 * blanks: 穴埋めのように複数の答えが順番に必要な場合の各正解。
 *   入力は空欄ごとの配列で渡す。文字列で渡したときは、空欄が 1 つならそのまま
 *   （「1/2」「and/or」のような答えを分けない）、2 つ以上なら「/」で区切ったものとして扱う
 */
export function checkAnswer(
  input: string | string[],
  expected: { accepted: string[] } | { blanks: string[] },
): AnswerCheck {
  if ('blanks' in expected) {
    const parts = Array.isArray(input)
      ? input
      : expected.blanks.length === 1
        ? [input.replace(/[/／\s]+$/, '')]
        : input.split(/[/／]/);
    const results = expected.blanks.map((b, i) => checkOne(parts[i] ?? '', [b]));
    // 穴の数より多く答えていたら不正解（「forward / incorrect」のように候補を並べて当てるのを防ぐ）。
    // 末尾の「/」など、空の余りは気にしない
    const extra = parts.slice(expected.blanks.length).some((p) => p.trim() !== '');
    const verdict: AnswerVerdict = extra
      ? 'wrong'
      : results.every((r) => r.verdict === 'correct')
        ? 'correct'
        : results.every((r) => r.verdict !== 'wrong')
          ? 'close'
          : 'wrong';
    return { verdict, expected: expected.blanks.join(' / '), recommended: RECOMMENDED[verdict] };
  }
  const r = checkOne(Array.isArray(input) ? input.join(' ') : input, expected.accepted);
  return { ...r, recommended: RECOMMENDED[r.verdict] };
}
