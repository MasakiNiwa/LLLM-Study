/**
 * 学習データの完全バックアップ（JSON）と復元。
 * 教材・学習記録・チャットをまとめて書き出す（AI モデルは含まない。モデルは「AI モデル」画面で書き出す）。
 */
import { db } from './db';

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
}

export async function exportBackup(): Promise<BackupFile> {
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
  };
}

function isBackup(v: unknown): v is BackupFile {
  const b = v as Partial<BackupFile> | null;
  return (
    !!b &&
    b.format === BACKUP_FORMAT &&
    b.version === 1 &&
    ['packs', 'items', 'cards', 'reviews', 'chat'].every((k) =>
      Array.isArray((b as Record<string, unknown>)[k]),
    )
  );
}

/** バックアップで今のデータをすべて置き換える */
export async function restoreBackup(text: string): Promise<{ packs: number; reviews: number }> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON として読み取れませんでした');
  }
  if (!isBackup(data)) throw new Error('このアプリのバックアップファイルではありません');
  const b = data;
  await db.transaction('rw', [db.packs, db.items, db.cards, db.reviews, db.chat], async () => {
    await Promise.all([
      db.packs.clear(),
      db.items.clear(),
      db.cards.clear(),
      db.reviews.clear(),
      db.chat.clear(),
    ]);
    await db.packs.bulkAdd(b.packs as never[]);
    await db.items.bulkAdd(b.items as never[]);
    await db.cards.bulkAdd(b.cards as never[]);
    await db.reviews.bulkAdd(b.reviews as never[]);
    await db.chat.bulkAdd(b.chat as never[]);
  });
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
}
