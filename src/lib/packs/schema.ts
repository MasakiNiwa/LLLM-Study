/**
 * 教材パック（Study Pack）の形式 v1。
 *
 * 外部の AI（ChatGPT / Claude / Gemini など）に教材を作ってもらい、このアプリに取り込むための取り決め。
 * - アプリ内の検証・型・外部 AI に渡す JSON Schema はすべてこの zod スキーマから作る（唯一の正）
 * - 人が読む説明は docs/STUDY_PACK_FORMAT.md
 * - 学習内容は単語帳に限らず広げられるよう、項目（item）は `type` で種類を分ける
 *
 * NOTE: scripts/build-packs.ts から Node で直接読み込むため、`@/` エイリアスや
 *       相対 import を使わない（zod だけに依存する）。
 */
import { z } from 'zod';

export const PACK_FORMAT = 'lllm-study-pack';
export const PACK_VERSION = 1;

const id = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/, '英数字と . _ - の 64 文字以内（先頭は英数字）');

const shortText = z.string().trim().min(1).max(300);
const longText = z.string().trim().min(1).max(2000);
const tags = z.array(z.string().trim().min(1).max(40)).max(20);

export const ExampleSchema = z
  .object({
    text: shortText.describe('例文（学ぶ言語）'),
    translation: shortText.optional().describe('例文の訳（説明の言語）'),
  })
  .describe('例文');

/** 長文読解などで、複数の問題が共有する本文 */
export const PassageSchema = z
  .object({
    id: id.describe('本文の ID（項目の passage から参照する）'),
    title: shortText.optional().describe('本文のタイトル'),
    text: z.string().trim().min(1).max(6000).describe('本文（学ぶ言語）'),
    translation: z.string().trim().min(1).max(6000).optional().describe('本文の訳（説明の言語）'),
    source: shortText.optional().describe('出典'),
  })
  .describe('本文（長文読解・会話文など）');

const itemBase = {
  id: id.describe('パック内で一意な ID（更新時に学習記録を引き継ぐキー。後から変えない）'),
  tags: tags.optional().describe('分類用のタグ'),
  notes: longText.optional().describe('補足・語法・注意点など'),
  passage: id
    .optional()
    .describe('この項目が参照する本文の ID（passages の id）。本文を問題の上に表示する'),
  image: z
    .string()
    .max(1_000_000)
    .regex(
      /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/,
      '画像は data URL（data:image/...;base64,...）で埋め込んでください',
    )
    .optional()
    .describe(
      '問題の上に表示する画像（data URL で埋め込む。外部の URL は使えない）。通常はアプリ内で追加するので、外部 AI は省略する',
    ),
};

/** 単語 */
export const VocabItemSchema = z
  .object({
    type: z.literal('vocab'),
    ...itemBase,
    term: shortText.describe('見出し語'),
    reading: shortText.optional().describe('発音記号（IPA）や読み方'),
    pos: shortText.optional().describe('品詞（例: 動詞, 名詞）'),
    meanings: z.array(shortText).min(1).max(8).describe('意味（説明の言語）。主要なものから順に'),
    examples: z.array(ExampleSchema).max(5).optional(),
    collocations: z.array(shortText).max(8).optional().describe('よく使う組み合わせ'),
    synonyms: z.array(shortText).max(8).optional(),
    antonyms: z.array(shortText).max(8).optional(),
    forms: z
      .array(shortText)
      .max(12)
      .optional()
      .describe(
        '活用形・変化形（例: took, taken）。不規則なものだけでよい。AI 例文クイズの答えの確認に使う',
      ),
  })
  .describe('単語カード');

/** フレーズ・表現 */
export const PhraseItemSchema = z
  .object({
    type: z.literal('phrase'),
    ...itemBase,
    phrase: shortText.describe('フレーズ・表現'),
    meaning: shortText.describe('意味（説明の言語）'),
    situation: shortText.optional().describe('使う場面'),
    examples: z.array(ExampleSchema).max(5).optional(),
    forms: z
      .array(shortText)
      .max(12)
      .optional()
      .describe('活用した形（例: took part in）。AI 例文クイズの答えの確認に使う'),
  })
  .describe('フレーズカード');

/** 一問一答（どの分野にも使える汎用形式） */
export const QaItemSchema = z
  .object({
    type: z.literal('qa'),
    ...itemBase,
    question: longText.describe('問題'),
    answer: longText.describe('答え'),
    accepted: z
      .array(shortText)
      .max(10)
      .optional()
      .describe(
        'ほかに正解にしてよい答え（別解・略称・表記揺れ）。答えを入力して答え合わせするときに使う',
      ),
    explanation: longText.optional().describe('解説'),
    hints: z.array(shortText).max(3).optional().describe('ヒント（弱いものから順に）'),
  })
  .describe('一問一答カード');

/** 穴埋め */
export const ClozeItemSchema = z
  .object({
    type: z.literal('cloze'),
    ...itemBase,
    text: longText
      .refine((t) => /\{\{[^{}]+\}\}/.test(t), '穴にする部分を {{ }} で囲んでください')
      .describe('穴にする部分を {{ }} で囲んだ文。例: I look {{forward}} to seeing you.'),
    translation: longText.optional().describe('文全体の訳'),
    hint: shortText.optional(),
    explanation: longText.optional(),
  })
  .describe('穴埋めカード');

/** 選択問題（正誤はアプリが判定する） */
export const ChoiceItemSchema = z
  .object({
    type: z.literal('choice'),
    ...itemBase,
    question: longText.describe('問題'),
    choices: z.array(shortText).min(2).max(6).describe('選択肢'),
    answer: z.number().int().min(0).describe('正解の選択肢の番号（0 始まり）'),
    explanation: longText.optional(),
  })
  .refine((v) => v.answer < v.choices.length, {
    message: 'answer は choices の範囲内の番号にしてください',
    path: ['answer'],
  })
  .describe('選択問題カード');

/** 比較用: 空白を取り除いて小文字にする */
function compact(s: string): string {
  return s.replace(/\s+/g, '').toLowerCase();
}

/** 並べ替え（語句を正しい順に並べる。正誤はアプリが判定する） */
export const OrderItemSchema = z
  .object({
    type: z.literal('order'),
    ...itemBase,
    answer: longText.describe('正しい順に並べた文（例: I have never been to Paris.）'),
    chunks: z
      .array(shortText)
      .min(2)
      .max(12)
      .optional()
      .describe(
        '並べ替える語句（正しい順）。省略すると answer を空白で区切る。日本語など空白で区切らない言語では必ず指定する',
      ),
    prompt: longText
      .optional()
      .describe('問題文・訳など（例: 私は一度もパリに行ったことがない。）'),
    explanation: longText.optional(),
  })
  .refine((v) => !v.chunks || compact(v.chunks.join('')) === compact(v.answer), {
    message: 'chunks をつなげると answer と同じ文になるようにしてください',
    path: ['chunks'],
  })
  .refine((v) => v.chunks || v.answer.trim().split(/\s+/).length >= 2, {
    message: '空白で区切れない文は chunks で語句を指定してください',
    path: ['chunks'],
  })
  .describe('並べ替えカード');

/** 金額（整数でも小数でもよい。マイナスは使わない） */
const amount = z.number().finite().min(0);

/** 仕訳の 1 行（勘定科目と金額） */
export const JournalLineSchema = z
  .object({
    account: shortText.describe('勘定科目'),
    amount: amount.describe('金額（数値。単位は問題文や unit で示す）'),
  })
  .describe('仕訳の 1 行');

/** 仕訳（借方と貸方の勘定科目・金額を答える。正誤はアプリが判定する） */
export const JournalItemSchema = z
  .object({
    type: z.literal('journal'),
    ...itemBase,
    question: longText.describe('取引の内容（例: 商品 100,000 円を掛けで仕入れた。）'),
    debit: z.array(JournalLineSchema).min(1).max(8).describe('借方（左側）の行'),
    credit: z.array(JournalLineSchema).min(1).max(8).describe('貸方（右側）の行'),
    accounts: z
      .array(shortText)
      .max(20)
      .optional()
      .describe(
        '選択肢に加える勘定科目（紛らわしいもの）。正解の科目は自動で選択肢に入るので書かなくてよい',
      ),
    unit: z.string().trim().max(20).optional().describe('金額の単位（例: 円, 千円）。既定は「円」'),
    explanation: longText.optional(),
  })
  .refine((v) => sumAmounts(v.debit) === sumAmounts(v.credit), {
    message: '借方の合計と貸方の合計を一致させてください',
    path: ['credit'],
  })
  .describe('仕訳カード');

/** 複数選択（正しいものをすべて選ぶ。正誤はアプリが判定する） */
export const MultiItemSchema = z
  .object({
    type: z.literal('multi'),
    ...itemBase,
    question: longText.describe('問題（例: リースに該当するものをすべて選びなさい。）'),
    choices: z.array(shortText).min(3).max(8).describe('選択肢'),
    answers: z
      .array(z.number().int().min(0))
      .min(1)
      .max(8)
      .describe('正解の選択肢の番号（0 始まり）。1 つ以上'),
    explanation: longText.optional(),
  })
  .refine((v) => v.answers.every((a) => a < v.choices.length), {
    message: 'answers は choices の範囲内の番号にしてください',
    path: ['answers'],
  })
  .refine((v) => new Set(v.answers).size === v.answers.length, {
    message: 'answers に同じ番号が重複しています',
    path: ['answers'],
  })
  .describe('複数選択カード');

/** 数値入力（計算問題。許容誤差つきでアプリが判定する） */
export const NumericItemSchema = z
  .object({
    type: z.literal('numeric'),
    ...itemBase,
    question: longText.describe('問題'),
    answer: z.number().finite().describe('正解の数値'),
    unit: z
      .string()
      .trim()
      .max(20)
      .optional()
      .describe('単位（例: 円, %, 年）。入力欄の横に表示する'),
    tolerance: z
      .number()
      .finite()
      .min(0)
      .optional()
      .describe('許容する誤差（絶対値）。端数処理で答えがずれうるとき。既定は 0'),
    hints: z.array(shortText).max(3).optional().describe('ヒント（弱いものから順に）'),
    explanation: longText.optional(),
  })
  .describe('数値入力カード');

/** 正誤（○×） */
export const TrueFalseItemSchema = z
  .object({
    type: z.literal('truefalse'),
    ...itemBase,
    statement: longText.describe('正誤を判断する文'),
    answer: z.boolean().describe('文が正しければ true'),
    explanation: longText
      .optional()
      .describe('解説（誤りの文では、どこが誤りで正しくはどうかを書く）'),
  })
  .describe('○×カード');

/** 組み合わせ（左の語句に右の語句を対応させる） */
export const MatchItemSchema = z
  .object({
    type: z.literal('match'),
    ...itemBase,
    prompt: longText.optional().describe('問題文（例: 用語と意味を組み合わせなさい。）'),
    pairs: z
      .array(z.object({ left: shortText, right: shortText }))
      .min(2)
      .max(8)
      .describe('正しい組み合わせ（左と右）。右の語句は表示するときに並べ替える'),
    explanation: longText.optional(),
  })
  .refine((v) => new Set(v.pairs.map((p) => p.right.trim())).size === v.pairs.length, {
    message: '右の語句が重複しています（どれも違う語句にしてください）',
    path: ['pairs'],
  })
  .describe('組み合わせカード');

/** 表の穴埋め（返済表・計算表などのマスを埋める） */
export const TableItemSchema = z
  .object({
    type: z.literal('table'),
    ...itemBase,
    question: longText.describe('問題文（表の前に表示する）'),
    columns: z.array(shortText).min(2).max(6).describe('列の見出し'),
    rows: z
      .array(z.array(z.string().trim().max(100)).min(2).max(6))
      .min(1)
      .max(12)
      .describe('行。各マスは文字列で、答えにするマスは {{ }} で囲む（例: "{{9,000}}"）'),
    explanation: longText.optional(),
  })
  .refine((v) => v.rows.every((r) => r.length === v.columns.length), {
    message: 'すべての行のマスの数を columns の数とそろえてください',
    path: ['rows'],
  })
  .refine((v) => v.rows.some((r) => r.some((c) => /\{\{[^{}]+\}\}/.test(c))), {
    message: '答えにするマスを 1 つ以上 {{ }} で囲んでください',
    path: ['rows'],
  })
  .describe('表の穴埋めカード');

/** 仕訳の行の金額の合計（小数の誤差を丸める） */
export function sumAmounts(lines: { amount: number }[]): number {
  return Math.round(lines.reduce((n, l) => n + l.amount, 0) * 1e6) / 1e6;
}

export const ItemSchema = z.discriminatedUnion('type', [
  VocabItemSchema,
  PhraseItemSchema,
  QaItemSchema,
  ClozeItemSchema,
  ChoiceItemSchema,
  OrderItemSchema,
  JournalItemSchema,
  MultiItemSchema,
  NumericItemSchema,
  TrueFalseItemSchema,
  MatchItemSchema,
  TableItemSchema,
]);

export const ITEM_TYPES = [
  'vocab',
  'phrase',
  'qa',
  'cloze',
  'choice',
  'order',
  'journal',
  'multi',
  'numeric',
  'truefalse',
  'match',
  'table',
] as const;

export const PackSchema = z
  .object({
    format: z.literal(PACK_FORMAT).describe(`固定値 "${PACK_FORMAT}"`),
    version: z.literal(PACK_VERSION).describe('形式のバージョン（固定値 1）'),
    id: id.describe('パックの ID（同じ ID で取り込むと更新として扱う）'),
    title: z.string().trim().min(1).max(100),
    description: z.string().trim().max(1000).optional(),
    subject: z
      .string()
      .trim()
      .max(40)
      .optional()
      .describe('分野（例: english, history, programming）'),
    language: z
      .object({
        target: z.string().trim().min(2).max(20).describe('学ぶ言語（BCP 47。例: en）'),
        explanation: z.string().trim().min(2).max(20).describe('説明に使う言語（BCP 47。例: ja）'),
      })
      .optional(),
    level: z.string().trim().max(40).optional().describe('難易度の目安（例: CEFR A2, 中学）'),
    tags: tags.optional(),
    author: z.string().trim().max(100).optional(),
    license: z.string().trim().max(100).optional(),
    source: z.string().trim().max(300).optional().describe('作り方・出典（例: Generated by AI）'),
    revision: z.number().int().min(1).optional().describe('パックの版。更新するたびに増やす'),
    passages: z
      .array(PassageSchema)
      .max(500)
      .optional()
      .describe('複数の項目が共有する本文（長文読解など）。項目の passage で参照する'),
    items: z.array(ItemSchema).min(1).max(5000),
  })
  .superRefine((pack, ctx) => {
    const passageIds = new Set<string>();
    pack.passages?.forEach((p, i) => {
      if (passageIds.has(p.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `本文の ID「${p.id}」が重複しています`,
          path: ['passages', i, 'id'],
        });
      }
      passageIds.add(p.id);
    });
    pack.items.forEach((item, i) => {
      if (item.passage && !passageIds.has(item.passage)) {
        ctx.addIssue({
          code: 'custom',
          message: `本文「${item.passage}」が passages にありません`,
          path: ['items', i, 'passage'],
        });
      }
    });
    const seen = new Set<string>();
    pack.items.forEach((item, i) => {
      if (seen.has(item.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `項目の ID「${item.id}」が重複しています`,
          path: ['items', i, 'id'],
        });
      }
      seen.add(item.id);
    });
  })
  .describe('LLLM Study の教材パック');

export type Example = z.infer<typeof ExampleSchema>;
export type Passage = z.infer<typeof PassageSchema>;
export type VocabItem = z.infer<typeof VocabItemSchema>;
export type PhraseItem = z.infer<typeof PhraseItemSchema>;
export type QaItem = z.infer<typeof QaItemSchema>;
export type ClozeItem = z.infer<typeof ClozeItemSchema>;
export type ChoiceItem = z.infer<typeof ChoiceItemSchema>;
export type OrderItem = z.infer<typeof OrderItemSchema>;
export type JournalLine = z.infer<typeof JournalLineSchema>;
export type JournalItem = z.infer<typeof JournalItemSchema>;
export type MultiItem = z.infer<typeof MultiItemSchema>;
export type NumericItem = z.infer<typeof NumericItemSchema>;
export type TrueFalseItem = z.infer<typeof TrueFalseItemSchema>;
export type MatchItem = z.infer<typeof MatchItemSchema>;
export type TableItem = z.infer<typeof TableItemSchema>;
export type StudyItem = z.infer<typeof ItemSchema>;
export type ItemType = StudyItem['type'];
export type StudyPack = z.infer<typeof PackSchema>;

/** 外部 AI に渡す JSON Schema */
export function packJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(PackSchema, { target: 'draft-2020-12', unrepresentable: 'any' });
}
