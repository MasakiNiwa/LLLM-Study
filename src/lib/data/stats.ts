/**
 * カレンダー・記録画面の集計（純粋関数。Data Worker から呼ぶ）。
 */
import type { CardRecord, ReviewRecord } from '@/lib/db/types';
import { studyDayKey } from '@/lib/srs/day';

export interface DayActivity {
  /** 評価した回数 */
  reviews: number;
  /** 「正解」「簡単」の回数 */
  correct: number;
  /** その日に初めて学習したカード数 */
  newCards: number;
  /** 学習した時間 */
  ms: number;
}

export interface CalendarData {
  activity: Record<string, DayActivity>;
  /** 学習日ごとの復習予定の枚数（期限切れは今日に含める） */
  forecast: Record<string, number>;
}

export function summarizeActivity(reviews: ReviewRecord[]): Record<string, DayActivity> {
  const out: Record<string, DayActivity> = {};
  for (const r of reviews) {
    const d = (out[r.day] ??= { reviews: 0, correct: 0, newCards: 0, ms: 0 });
    d.reviews++;
    if (r.rating >= 3) d.correct++;
    if (r.state === 0) d.newCards++;
    d.ms += r.durationMs;
  }
  return out;
}

export function summarizeForecast(
  cards: Pick<CardRecord, 'due' | 'state' | 'suspended'>[],
  today: string,
  dayStartHour: number,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of cards) {
    if (c.state === 0 || c.suspended) continue;
    let day = studyDayKey(c.due, dayStartHour);
    if (day < today) day = today;
    out[day] = (out[day] ?? 0) + 1;
  }
  return out;
}
