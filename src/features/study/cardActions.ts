/**
 * カード（項目）単位の操作: 出題を止める・再開する。
 * 1 つの項目から作られたカード（意味を答える・単語を答えるなど）はまとめて扱う。
 */
import { notifyLibraryChange } from '@/lib/db/changes';
import { db } from '@/lib/db/db';

/**
 * 項目の出題を止める・再開する。型を外して休止しているカード（suspended = 2）はそのまま。
 * notify: 学習中のセッションに知らせる（学習画面から止めるときは、画面側で次へ進むので不要）
 */
export async function setItemSuspended(
  itemKey: string,
  suspended: boolean,
  { notify = true }: { notify?: boolean } = {},
): Promise<void> {
  await db.cards
    .where('itemKey')
    .equals(itemKey)
    .filter((c) => c.suspended !== 2)
    .modify({ suspended: suspended ? 1 : 0 });
  if (notify) notifyLibraryChange([itemKey.slice(0, itemKey.lastIndexOf('/'))]);
}

/** 何度も忘れている（苦手な）カードとみなす忘れた回数 */
export const LEECH_LAPSES = 4;
