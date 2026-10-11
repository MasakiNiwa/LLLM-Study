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
  type CalendarData,
  type StatsData,
} from './stats';

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

  /** 学習した日の一覧（連続日数・記録の表示用） */
  async studyDays(): Promise<string[]> {
    return (await db.reviews.orderBy('day').uniqueKeys()) as string[];
  },
};

export type DataWorkerApi = typeof api;

Comlink.expose(api);
