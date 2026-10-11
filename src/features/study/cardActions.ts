/**
 * カード（項目）単位の操作: 出題を止める・再開する。
 * 1 つの項目から作られたカード（意味を答える・単語を答えるなど）はまとめて扱う。
 */
import { db } from '@/lib/db/db';

export async function setItemSuspended(itemKey: string, suspended: boolean): Promise<void> {
  await db.cards
    .where('itemKey')
    .equals(itemKey)
    .modify({ suspended: suspended ? 1 : 0 });
}

/** 何度も忘れている（苦手な）カードとみなす忘れた回数 */
export const LEECH_LAPSES = 4;
