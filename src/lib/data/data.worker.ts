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
import { summarizeActivity, summarizeForecast, type CalendarData } from './stats';

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

  /** 学習した日の一覧（連続日数・記録の表示用） */
  async studyDays(): Promise<string[]> {
    return (await db.reviews.orderBy('day').uniqueKeys()) as string[];
  },
};

export type DataWorkerApi = typeof api;

Comlink.expose(api);
