/// <reference lib="webworker" />
/**
 * 重いデータ処理を UI スレッドから外すための Worker。
 * - 教材パックの解析・検証（数千項目の JSON でも画面が固まらない）
 * - カレンダー用の集計（学習記録が増えても軽い）
 * IndexedDB は Worker からも使えるので、DB を直接読む。
 */
import * as Comlink from 'comlink';
import { db } from '@/lib/db/db';
import { parsePackText } from '@/lib/packs/parse';
import { addDays } from '@/lib/srs/day';
import { retrievability } from '@/lib/srs/scheduler';
import {
  summarizeActivity,
  summarizeForecast,
  summarizeStates,
  itemStatus,
  type CalendarData,
  type ItemSummary,
  type StatsData,
} from './stats';
import { itemAnswer, itemSearchText, itemTitle } from '@/lib/packs/itemText';
import type { CardRecord, ItemRecord } from '@/lib/db/types';

async function summarize(items: ItemRecord[]): Promise<ItemSummary[]> {
  const cards = await db.cards
    .where('itemKey')
    .anyOf(items.map((i) => i.key))
    .toArray();
  const byItem = new Map<string, CardRecord[]>();
  for (const c of cards) byItem.set(c.itemKey, [...(byItem.get(c.itemKey) ?? []), c]);
  return items.map((i) => {
    const cs = byItem.get(i.key) ?? [];
    const learned = cs.filter((c) => c.state !== 0 && !c.suspended);
    return {
      key: i.key,
      packId: i.packId,
      title: itemTitle(i.item),
      answer: itemAnswer(i.item),
      status: itemStatus(cs),
      nextDue: learned.length ? Math.min(...learned.map((c) => c.due)) : undefined,
    };
  });
}

const api = {
  parsePack(text: string) {
    return parsePackText(text);
  },

  /** from〜to（学習日、両端含む）の活動と予定 */
  async calendar(
    from: string,
    to: string,
    today: string,
    dayStartHour: number,
  ): Promise<CalendarData> {
    const reviews = await db.reviews.where('day').between(from, to, true, true).toArray();
    const cards = await db.cards.where('state').anyOf(1, 2, 3).toArray();
    return {
      activity: summarizeActivity(reviews),
      forecast: summarizeForecast(cards, today, dayStartHour),
    };
  },

  /** 記録ページの集計（過去 days 日・今後 days 日） */
  async stats(today: string, dayStartHour: number, days: number, now: number): Promise<StatsData> {
    const from = addDays(today, -(days - 1));
    const [cards, recent, totalReviews, allDays] = await Promise.all([
      db.cards.toArray(),
      db.reviews.where('day').between(from, today, true, true).toArray(),
      db.reviews.count(),
      db.reviews.orderBy('day').uniqueKeys(),
    ]);
    let totalMs = 0;
    await db.reviews.each((r) => {
      totalMs += r.durationMs;
    });
    const activity = summarizeActivity(recent);
    const forecastMap = summarizeForecast(cards, today, dayStartHour);
    const learned = cards.filter((c) => c.state !== 0 && !c.suspended);
    const recall = learned.map((c) => retrievability(c, now) ?? 0);
    return {
      states: summarizeStates(cards),
      history: Array.from({ length: days }, (_, i) => {
        const day = addDays(from, i);
        const a = activity[day];
        return { day, reviews: a?.reviews ?? 0, correct: a?.correct ?? 0, ms: a?.ms ?? 0 };
      }),
      forecast: Array.from({ length: days }, (_, i) => {
        const day = addDays(today, i);
        return { day, count: forecastMap[day] ?? 0 };
      }),
      totalReviews,
      totalMs,
      studyDays: allDays.length,
      averageRecall: recall.length ? recall.reduce((a, b) => a + b, 0) / recall.length : undefined,
    };
  },

  /** 1 つの教材の項目一覧（学習状況つき。教材内の順番） */
  async packItems(packId: string): Promise<ItemSummary[]> {
    return summarize(await db.items.where('packId').equals(packId).sortBy('order'));
  },

  /** すべての教材から項目を探す（大文字小文字は区別しない） */
  async searchItems(query: string, limit: number): Promise<ItemSummary[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const items = await db.items
      .filter((i) => itemSearchText(i.item).includes(q))
      .limit(limit)
      .toArray();
    return summarize(items);
  },

  /** 学習した日の一覧（連続日数・記録の表示用） */
  async studyDays(): Promise<string[]> {
    return (await db.reviews.orderBy('day').uniqueKeys()) as string[];
  },
};

export type DataWorkerApi = typeof api;

Comlink.expose(api);
