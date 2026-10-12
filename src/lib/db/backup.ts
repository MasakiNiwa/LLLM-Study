/**
 * 学習データの完全バックアップ（JSON）と復元。
 * 教材・学習記録・チャット・設定をまとめて書き出す（AI モデルは含まない。モデルは「AI モデル」画面で書き出す）。
 *
 * 復元は「全件を検証してから置き換える」。形が合わないレコードが 1 件でもあれば、今のデータには触れない。
 */
import { z } from 'zod';
import { ITEM_TYPES, ItemSchema, PassageSchema } from '@/lib/packs/schema';
import { notifyLibraryChange } from './changes';
import { db } from './db';
import type { CardRecord, ChatRecord, ItemRecord, PackRecord, ReviewRecord } from './types';

export const BACKUP_FORMAT = 'lllm-study-backup';

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  packs: unknown[];
  items: unknown[];
  cards: unknown[];
  reviews: unknown[];
  chat: unknown[];
  /** 端末によらない設定（学習の上限・1 日の始まり・AI の性格など）。古いバックアップにはない */
  settings?: Record<string, unknown>;
}

/** settings: 一緒に書き出す設定（端末ごとの設定は呼び出し側で除いておく） */
export async function exportBackup(
  options: { settings?: Record<string, unknown> } = {},
): Promise<BackupFile> {
  const [packs, items, cards, reviews, chat] = await Promise.all([
    db.packs.toArray(),
    db.items.toArray(),
    db.cards.toArray(),
    db.reviews.toArray(),
    db.chat.toArray(),
  ]);
  return {
    format: BACKUP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    packs,
    items,
    cards,
    reviews,
    chat,
    ...(options.settings && { settings: options.settings }),
  };
}

// ---- 検証用のスキーマ（DB のレコードの形） ----

const num = z.number().finite();
const nonNeg = num.min(0);
const count = z.number().int().min(0);
const str = z.string().min(1);
const itemType = z.enum(ITEM_TYPES);
const cardState = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

const PackRecordSchema = z.looseObject({
  id: str,
  title: str,
  description: z.string().optional(),
  subject: z.string().optional(),
  language: z.object({ target: z.string(), explanation: z.string() }).optional(),
  level: z.string().optional(),
  tags: z.array(z.string()).optional(),
  revision: num.optional(),
  passages: z.array(PassageSchema).optional(),
  origin: z.enum(['sample', 'import', 'user']),
  sampleFile: z.string().optional(),
  itemCount: count,
  itemTypes: z.array(itemType),
  installedAt: num,
  updatedAt: num,
  enabled: z.boolean(),
  templates: z.partialRecord(itemType, z.array(z.string())),
  order: num,
});

const ItemRecordSchema = z
  .object({
    key: str,
    packId: str,
    itemId: str,
    order: num,
    item: ItemSchema,
    passage: PassageSchema.optional(),
  })
  .refine((r) => r.key === `${r.packId}/${r.itemId}` && r.item.id === r.itemId, {
    message: '項目のキーと ID が一致しません',
  });

const fsrsShape = {
  due: num,
  stability: nonNeg,
  difficulty: num,
  elapsed_days: num,
  scheduled_days: nonNeg,
  learning_steps: count,
  reps: count,
  lapses: count,
  state: cardState,
  last_review: num.optional(),
};

const CardRecordSchema = z
  .object({
    ...fsrsShape,
    id: str,
    packId: str,
    itemKey: str,
    template: str,
    order: num,
    suspended: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    introducedDay: z.string().optional(),
  })
  .refine((c) => c.id === `${c.itemKey}#${c.template}`, {
    message: 'カードの ID が項目と型に一致しません',
  });

const ReviewRecordSchema = z.object({
  id: z.number().int().optional(),
  cardId: str,
  packId: str,
  itemKey: str,
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  state: cardState,
  review: num,
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  durationMs: nonNeg,
  nextDue: num,
  scheduled_days: nonNeg,
  elapsed_days: num,
  stability: nonNeg,
  difficulty: num,
  prev: z.object({ ...fsrsShape, introducedDay: z.string().optional() }),
});

const ChatRecordSchema = z.object({
  id: str,
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  context: z.string().optional(),
  thinking: z.string().optional(),
  tools: z.array(z.string()).optional(),
  proposals: z
    .array(z.object({ draft: z.looseObject({ type: itemType }), added: z.boolean().optional() }))
    .optional(),
  createdAt: num,
  error: z.string().optional(),
});

const BackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.literal(1),
  exportedAt: z.string().optional(),
  packs: z.array(PackRecordSchema),
  items: z.array(ItemRecordSchema),
  cards: z.array(CardRecordSchema),
  reviews: z.array(ReviewRecordSchema),
  chat: z.array(ChatRecordSchema),
  settings: z.record(z.string(), z.unknown()).optional(),
});

export interface ParsedBackup {
  exportedAt?: string;
  packs: PackRecord[];
  items: ItemRecord[];
  cards: CardRecord[];
  reviews: ReviewRecord[];
  chat: ChatRecord[];
  settings?: Record<string, unknown>;
  /** 対応するカードがないため除外した学習記録の数 */
  skippedReviews: number;
}

function duplicate<T>(list: T[], key: (t: T) => unknown): unknown {
  const seen = new Set<unknown>();
  for (const t of list) {
    const k = key(t);
    if (seen.has(k)) return k;
    seen.add(k);
  }
  return undefined;
}

/**
 * バックアップを読み取り、すべてのレコードを検証する（DB には触れない）。
 * 形が合わない・重複する・参照先がないレコードがあれば、理由を添えてエラーにする。
 * 対応するカードがない学習記録だけは、除外して数を返す（以前の版の不具合で残ったものを含むため）。
 */
export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON として読み取れませんでした');
  }
  const head = data as { format?: unknown } | null;
  if (!head || head.format !== BACKUP_FORMAT) {
    throw new Error('このアプリのバックアップファイルではありません');
  }
  const r = BackupSchema.safeParse(data);
  if (!r.success) {
    const issue = r.error.issues[0];
    const where = issue.path
      .map((p) => (typeof p === 'number' ? `[${p + 1} 件目]` : String(p)))
      .join(' ');
    throw new Error(`バックアップの内容が正しくありません（${where}: ${issue.message}）`);
  }
  const b = r.data;
  const dup =
    duplicate(b.packs, (p) => p.id) ??
    duplicate(b.items, (i) => i.key) ??
    duplicate(b.cards, (c) => c.id) ??
    duplicate(b.chat, (m) => m.id) ??
    duplicate(
      b.reviews.filter((x) => x.id !== undefined),
      (x) => x.id,
    );
  if (dup !== undefined)
    throw new Error(`バックアップに同じ ID が重複しています（${String(dup)}）`);

  const packIds = new Set(b.packs.map((p) => p.id));
  const itemKeys = new Set(b.items.map((i) => i.key));
  const orphanItem = b.items.find((i) => !packIds.has(i.packId));
  if (orphanItem) throw new Error(`教材のない項目があります（${orphanItem.key}）`);
  const orphanCard = b.cards.find((c) => !packIds.has(c.packId) || !itemKeys.has(c.itemKey));
  if (orphanCard) throw new Error(`教材・項目のないカードがあります（${orphanCard.id}）`);
  const cardIds = new Set(b.cards.map((c) => c.id));
  const reviews = b.reviews.filter((x) => cardIds.has(x.cardId));

  return {
    exportedAt: b.exportedAt,
    packs: b.packs as PackRecord[],
    items: b.items as ItemRecord[],
    cards: b.cards as CardRecord[],
    reviews: reviews as ReviewRecord[],
    chat: b.chat as ChatRecord[],
    settings: b.settings,
    skippedReviews: b.reviews.length - reviews.length,
  };
}

/** 検証済みのバックアップで、今のデータをすべて置き換える（途中で失敗したら元のまま） */
export async function applyBackup(b: ParsedBackup): Promise<void> {
  await db.transaction('rw', [db.packs, db.items, db.cards, db.reviews, db.chat], async () => {
    await Promise.all([
      db.packs.clear(),
      db.items.clear(),
      db.cards.clear(),
      db.reviews.clear(),
      db.chat.clear(),
    ]);
    await db.packs.bulkAdd(b.packs);
    await db.items.bulkAdd(b.items);
    await db.cards.bulkAdd(b.cards);
    await db.reviews.bulkAdd(b.reviews);
    await db.chat.bulkAdd(b.chat);
  });
  notifyLibraryChange(null);
}

/** バックアップを検証して、今のデータをすべて置き換える */
export async function restoreBackup(text: string): Promise<{ packs: number; reviews: number }> {
  const b = parseBackup(text);
  await applyBackup(b);
  return { packs: b.packs.length, reviews: b.reviews.length };
}

/** 学習記録だけを消す（教材は残し、すべて未学習に戻す） */
export async function clearAllProgress(): Promise<void> {
  const { newFsrsFields } = await import('@/lib/srs/scheduler');
  await db.transaction('rw', [db.cards, db.reviews], async () => {
    await db.reviews.clear();
    const fresh = newFsrsFields(Date.now());
    const cards = await db.cards.toArray();
    await db.cards.bulkPut(cards.map((c) => ({ ...c, ...fresh, introducedDay: undefined })));
  });
  notifyLibraryChange(null);
}

/** すべての学習データを消す */
export async function clearAllData(): Promise<void> {
  await db.transaction(
    'rw',
    [db.packs, db.items, db.cards, db.reviews, db.chat, db.meta],
    async () => {
      await Promise.all([
        db.packs.clear(),
        db.items.clear(),
        db.cards.clear(),
        db.reviews.clear(),
        db.chat.clear(),
        db.meta.clear(),
      ]);
    },
  );
  notifyLibraryChange(null);
}
