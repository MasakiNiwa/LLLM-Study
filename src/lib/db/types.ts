import type { ItemType, Passage, StudyItem, StudyPack } from '@/lib/packs/schema';
import type { UserItemDraft } from '@/lib/packs/userPack';

/** カードの学習状態（ts-fsrs の State と同じ値） */
export const CardState = { New: 0, Learning: 1, Review: 2, Relearning: 3 } as const;
export type CardStateValue = (typeof CardState)[keyof typeof CardState];

/** 評価（ts-fsrs の Rating と同じ値） */
export const Grade = { Again: 1, Hard: 2, Good: 3, Easy: 4 } as const;
export type GradeValue = (typeof Grade)[keyof typeof Grade];

/** sample: 同梱のサンプル、import: 取り込んだ教材、user: 自分で作ったカード（マイカード） */
export type PackOrigin = 'sample' | 'import' | 'user';

/** 取り込んだ教材パック（項目は items テーブルに分けて持つ） */
export interface PackRecord extends Omit<StudyPack, 'items' | 'format' | 'version'> {
  origin: PackOrigin;
  /** サンプル教材のファイル名（public/packs/ 内） */
  sampleFile?: string;
  itemCount: number;
  /** 含まれる項目の種類 */
  itemTypes: ItemType[];
  installedAt: number;
  updatedAt: number;
  /** false: 学習の対象外（記録は残す） */
  enabled: boolean;
  /** 種類ごとに有効なカードの型（例: vocab → ['recognize', 'recall']） */
  templates: Partial<Record<ItemType, string[]>>;
  /** 新しいカードを出す順番の優先度（小さいほど先） */
  order: number;
}

export interface ItemRecord {
  /** `${packId}/${itemId}` */
  key: string;
  packId: string;
  itemId: string;
  /** パック内の並び順 */
  order: number;
  item: StudyItem;
  /** 項目が参照する本文（取り込み時にパックの passages からコピーしておく） */
  passage?: Passage;
}

/** FSRS のカード状態（日時はすべてエポックミリ秒） */
export interface FsrsFields {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: CardStateValue;
  last_review?: number;
}

export interface CardRecord extends FsrsFields {
  /** `${itemKey}#${template}` */
  id: string;
  packId: string;
  itemKey: string;
  template: string;
  /** 新しいカードの出題順（パック内の項目の順） */
  order: number;
  /** 1: 項目の出題を止めている、2: 教材でこのカードの型を外している（記録は残す） */
  suspended: 0 | 1 | 2;
  /** 初めて学習した学習日（YYYY-MM-DD） */
  introducedDay?: string;
}

export interface ReviewRecord {
  id?: number;
  cardId: string;
  packId: string;
  itemKey: string;
  rating: GradeValue;
  /** 評価する前の状態 */
  state: CardStateValue;
  /** 評価した日時 */
  review: number;
  /** 学習日（1 日の始まりの時刻を考慮した YYYY-MM-DD） */
  day: string;
  /** 回答までにかかった時間 */
  durationMs: number;
  /** 評価後の次回予定 */
  nextDue: number;
  scheduled_days: number;
  elapsed_days: number;
  stability: number;
  difficulty: number;
  /** 取り消し用: 評価前のカードの状態 */
  prev: FsrsFields & { introducedDay?: string };
}

export interface ChatRecord {
  id: string;
  role: 'user' | 'assistant';
  /** 画面に表示する本文 */
  text: string;
  /** モデルにだけ渡す文脈（アプリの状態など）。ユーザーの発話の前に付ける */
  context?: string;
  thinking?: string;
  /** モデルが使ったツールの名前 */
  tools?: string[];
  /** AI が提案したカード（ユーザーが「追加」を押すとマイカードに保存する） */
  proposals?: { draft: UserItemDraft; added?: boolean }[];
  createdAt: number;
  error?: string;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}
