/**
 * 項目の種類ごとのカードの型（1 つの項目から何枚のカードを作るか）。
 * 例: 単語は「英→日（意味を思い出す）」と「日→英（単語を思い出す）」の 2 方向。
 *
 * 種類を増やすときは schema.ts の ItemSchema と、ここ・features/items/ の表示を追加する。
 */
import type { ItemType } from './schema';

export interface TemplateDef {
  id: string;
  label: string;
  description: string;
  /** 取り込み時に既定で有効にするか */
  defaultEnabled: boolean;
}

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  vocab: '単語',
  phrase: 'フレーズ',
  qa: '一問一答',
  cloze: '穴埋め',
  choice: '選択問題',
  order: '並べ替え',
  journal: '仕訳',
  multi: '複数選択',
  numeric: '数値入力',
  truefalse: '○×',
  match: '組み合わせ',
  table: '表の穴埋め',
};

export const TEMPLATES: Record<ItemType, TemplateDef[]> = {
  vocab: [
    {
      id: 'recognize',
      label: '意味を答える',
      description: '単語を見て意味を思い出す',
      defaultEnabled: true,
    },
    {
      id: 'recall',
      label: '単語を答える',
      description: '意味を見て単語を思い出す（難しめ）',
      defaultEnabled: false,
    },
    {
      id: 'listen',
      label: '聞いて答える',
      description: '音声だけを聞いて意味を思い出す（聞き取りの練習）',
      defaultEnabled: false,
    },
  ],
  phrase: [
    {
      id: 'recognize',
      label: '意味を答える',
      description: 'フレーズを見て意味を思い出す',
      defaultEnabled: true,
    },
    {
      id: 'recall',
      label: 'フレーズを答える',
      description: '意味を見てフレーズを思い出す（難しめ）',
      defaultEnabled: false,
    },
    {
      id: 'listen',
      label: '聞いて答える',
      description: '音声だけを聞いて意味を思い出す（聞き取りの練習）',
      defaultEnabled: false,
    },
  ],
  qa: [
    { id: 'basic', label: '答える', description: '問題を見て答えを思い出す', defaultEnabled: true },
  ],
  cloze: [
    { id: 'basic', label: '穴を埋める', description: '文の空欄を思い出す', defaultEnabled: true },
  ],
  choice: [{ id: 'basic', label: '選ぶ', description: '選択肢から答える', defaultEnabled: true }],
  order: [
    {
      id: 'basic',
      label: '並べ替える',
      description: '語句を正しい順に並べる',
      defaultEnabled: true,
    },
  ],
  journal: [
    {
      id: 'basic',
      label: '仕訳を切る',
      description: '取引を読んで借方・貸方の科目と金額を答える',
      defaultEnabled: true,
    },
  ],
  multi: [
    {
      id: 'basic',
      label: 'すべて選ぶ',
      description: '正しいものをすべて選ぶ',
      defaultEnabled: true,
    },
  ],
  numeric: [
    { id: 'basic', label: '計算する', description: '数値を計算して答える', defaultEnabled: true },
  ],
  truefalse: [
    { id: 'basic', label: '○×で答える', description: '文の正誤を判断する', defaultEnabled: true },
  ],
  match: [
    {
      id: 'basic',
      label: '組み合わせる',
      description: '左の語句に合う右の語句を選ぶ',
      defaultEnabled: true,
    },
  ],
  table: [
    {
      id: 'basic',
      label: '表を埋める',
      description: '計算表・返済表などの空欄を埋める',
      defaultEnabled: true,
    },
  ],
};

export function defaultTemplates(types: Iterable<ItemType>): Partial<Record<ItemType, string[]>> {
  const result: Partial<Record<ItemType, string[]>> = {};
  for (const t of types) {
    result[t] = TEMPLATES[t].filter((d) => d.defaultEnabled).map((d) => d.id);
  }
  return result;
}

export function templateLabel(type: ItemType, template: string): string {
  return TEMPLATES[type].find((t) => t.id === template)?.label ?? template;
}
