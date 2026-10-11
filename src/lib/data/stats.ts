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

export interface CardStateSummary {
  /** 未学習 */
  newCards: number;
  /** 学習中・再学習中（分単位のステップ） */
  learning: number;
  /** 復習中（間隔 21 日未満） */
  young: number;
  /** 定着（間隔 21 日以上） */
  mature: number;
}

/** 間隔がこの日数以上のカードを「定着」とみなす（Anki などと同じ基準） */
export const MATURE_DAYS = 21;

export function summarizeStates(
  cards: Pick<CardRecord, 'state' | 'scheduled_days' | 'suspended'>[],
): CardStateSummary {
  const s: CardStateSummary = { newCards: 0, learning: 0, young: 0, mature: 0 };
  for (const c of cards) {
    if (c.suspended) continue;
    if (c.state === 0) s.newCards++;
    else if (c.state === 2) {
      if (c.scheduled_days >= MATURE_DAYS) s.mature++;
      else s.young++;
    } else s.learning++;
  }
  return s;
}

export interface StatsData {
  states: CardStateSummary;
  /** 過去 days 日の学習日ごとの活動（古い順。学習していない日も含む） */
  history: { day: string; reviews: number; correct: number; ms: number }[];
  /** 今日から days 日の復習予定（今日は期限切れを含む） */
  forecast: { day: string; count: number }[];
  totalReviews: number;
  totalMs: number;
  studyDays: number;
  /** 学習済みカードの、いま思い出せる確率の平均（0〜1。学習済みが無ければ undefined） */
  averageRecall?: number;
}
