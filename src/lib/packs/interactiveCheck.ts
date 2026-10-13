/**
 * 仕訳・複数選択・数値入力・○×・組み合わせ・表の穴埋めの答え合わせ（プログラムが判定する）。
 * 画面（features/items/InteractiveFaces.tsx）から呼び、結果は学習の記録とひとことの出し分けに使う。
 */
import { normalizeAnswer } from '@/lib/srs/answerCheck';
import type {
  JournalItem,
  JournalLine,
  MatchItem,
  MultiItem,
  NumericItem,
  StudyItem,
  TableItem,
} from './schema';
import { clozeAnswers } from './itemText';

/** カードの中で答える種類（答えを入力・選択してアプリが判定する） */
export const INTERACTIVE_TYPES: ReadonlySet<StudyItem['type']> = new Set([
  'choice',
  'order',
  'journal',
  'multi',
  'numeric',
  'truefalse',
  'match',
  'table',
]);

export function isInteractive(item: StudyItem): boolean {
  return INTERACTIVE_TYPES.has(item.type);
}

/**
 * 入力した数値を読み取る。桁区切り・全角・単位（円・% など）・△▲（マイナス）・分数（3/4）に対応。
 * 読み取れなければ null
 */
export function parseNumber(input: string): number | null {
  let s = input.normalize('NFKC').trim().replace(/[,\s]/g, '');
  if (!s) return null;
  let sign = 1;
  if (/^[△▲−-]/.test(s)) {
    sign = -1;
    s = s.slice(1);
  }
  // 前後の単位や記号（¥ 円 % 年 千円 など）を取り除く
  s = s.replace(/^[^\d.]+/, '').replace(/[^\d.]+$/, '');
  const frac = /^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/.exec(s);
  if (frac) {
    const d = Number(frac[2]);
    return d === 0 ? null : (sign * Number(frac[1])) / d;
  }
  if (!/^\d*\.?\d+$|^\d+\.$/.test(s)) return null;
  return sign * Number(s);
}

/** 数値が等しいか（tolerance は絶対値の許容誤差。小数の計算誤差は常に許す） */
function sameNumber(a: number, b: number, tolerance = 0): boolean {
  return Math.abs(a - b) <= tolerance + 1e-9 * Math.max(1, Math.abs(b));
}

export function checkNumeric(input: string, item: Pick<NumericItem, 'answer' | 'tolerance'>) {
  const value = parseNumber(input);
  return { value, correct: value !== null && sameNumber(value, item.answer, item.tolerance) };
}

export function checkMulti(selected: number[], item: Pick<MultiItem, 'answers'>): boolean {
  const a = new Set(selected);
  return a.size === item.answers.length && item.answers.every((i) => a.has(i));
}

/** 組み合わせ: picks[i] は左の i 番目に選んだ右の語句 */
export function checkMatch(picks: (string | null)[], item: Pick<MatchItem, 'pairs'>) {
  const rows = item.pairs.map((p, i) => picks[i] === p.right);
  return { rows, correct: rows.every(Boolean) };
}

/** 表の空欄の正解（行の順、左から） */
export function tableBlanks(item: Pick<TableItem, 'rows'>): string[] {
  return item.rows.flat().flatMap((cell) => clozeAnswers(cell));
}

/** 表のマス 1 つ: 数値どうしなら数値で、それ以外は文字で比べる */
export function sameCell(input: string, expected: string): boolean {
  const a = parseNumber(input);
  const b = parseNumber(expected);
  if (a !== null && b !== null) return sameNumber(a, b);
  const x = normalizeAnswer(input);
  return x !== '' && x === normalizeAnswer(expected);
}

export function checkTable(inputs: string[], item: Pick<TableItem, 'rows'>) {
  const cells = tableBlanks(item).map((b, i) => sameCell(inputs[i] ?? '', b));
  return { cells, correct: cells.every(Boolean) };
}

/** 仕訳で入力した 1 行（金額は入力した文字のまま） */
export interface JournalInputLine {
  account: string;
  amount: string;
}

export interface JournalInput {
  debit: JournalInputLine[];
  credit: JournalInputLine[];
}

/** 科目ごとに金額を合計する（同じ科目を 2 行に分けて書いても同じとみなす）。読めない金額は NaN */
function totals(lines: { account: string; amount: number }[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of lines) {
    const k = l.account.trim();
    if (!k) continue;
    m.set(k, (m.get(k) ?? 0) + l.amount);
  }
  return m;
}

function sameTotals(a: Map<string, number>, b: Map<string, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of b) {
    const x = a.get(k);
    if (x === undefined || !sameNumber(x, v)) return false;
  }
  return true;
}

function inputLines(lines: JournalInputLine[]): { account: string; amount: number }[] {
  return lines
    .filter((l) => l.account.trim() || l.amount.trim())
    .map((l) => ({ account: l.account, amount: parseNumber(l.amount) ?? Number.NaN }));
}

/**
 * 仕訳の答え合わせ。借方・貸方それぞれで、科目ごとの金額の合計が一致すれば正解（行の順は問わない）。
 * 行ごとの結果（入力した行が正解の科目・金額か）も返す
 */
export function checkJournal(input: JournalInput, item: Pick<JournalItem, 'debit' | 'credit'>) {
  const side = (given: JournalInputLine[], expected: JournalLine[]) => {
    const want = totals(expected);
    const lines = inputLines(given);
    const ok = sameTotals(totals(lines), want);
    // 行ごとの判定: 科目が正解にあり、金額がその科目の金額と一致する（分けて書いた場合は合計で判定済み）
    const rows = given.map((l) => {
      const amount = parseNumber(l.amount);
      const w = want.get(l.account.trim());
      return w !== undefined && amount !== null && (ok || sameNumber(amount, w));
    });
    return { ok, rows };
  };
  const debit = side(input.debit, item.debit);
  const credit = side(input.credit, item.credit);
  return { correct: debit.ok && credit.ok, debit, credit };
}

/** 仕訳の科目の選択肢（正解の科目と紛らわしい科目。並びは種で決める） */
export function journalAccounts(
  item: Pick<JournalItem, 'debit' | 'credit' | 'accounts'>,
  seed: string,
) {
  const all = [
    ...new Set([...item.debit, ...item.credit].map((l) => l.account).concat(item.accounts ?? [])),
  ];
  return seededShuffle(all, seed);
}

/** 種から決まる並べ替え（同じカードでは毎回同じ並びにする） */
export function seededShuffle<T>(list: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    const j = ((h ^ (h >>> 16)) >>> 0) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 金額を桁区切りで表示する */
export function formatAmount(n: number): string {
  return n.toLocaleString('ja-JP', { maximumFractionDigits: 6 });
}

/** カードの中で答えた内容を、AI に渡す文字にする（どこを間違えたかを解説してもらうため） */
export function interactiveAnswerText(item: StudyItem, value: unknown): string {
  switch (item.type) {
    case 'choice':
      return typeof value === 'number' ? (item.choices[value] ?? '') : '';
    case 'journal': {
      const v = value as JournalInput;
      const side = (lines: JournalInputLine[]) =>
        lines
          .filter((l) => l.account || l.amount)
          .map((l) => `${l.account || '（科目なし）'} ${l.amount || '（金額なし）'}`)
          .join('、') || '（なし）';
      return `借方: ${side(v.debit)} / 貸方: ${side(v.credit)}`;
    }
    case 'multi':
      return (value as number[]).map((i) => item.choices[i]).join('、');
    case 'numeric':
      return `${String(value)}${item.unit && !/[^\d,.\s]$/.test(String(value)) ? item.unit : ''}`;
    case 'truefalse':
      return value ? '○（正しい）' : '×（誤り）';
    case 'match':
      return item.pairs
        .map((p, i) => `${p.left} → ${(value as (string | null)[])[i] ?? '（未選択）'}`)
        .join('、');
    case 'table':
      return tableBlanks(item)
        .map((_, i) => (value as string[])[i] || '（空欄）')
        .join(' / ');
    default:
      return '';
  }
}
