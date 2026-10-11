import { describe, expect, it } from 'vitest';
import type { ReviewRecord } from '@/lib/db/types';
import {
  itemStatus,
  summarizeActivity,
  summarizeForecast,
  summarizeStates,
  yearStart,
  YEAR_WEEKS,
} from './stats';
import { diffDays, parseDayKey } from '@/lib/srs/day';

describe('stats', () => {
  it('日ごとの活動を集計する', () => {
    const r = (day: string, rating: 1 | 3, state: 0 | 2) =>
      ({ day, rating, state, durationMs: 1000 }) as ReviewRecord;
    const a = summarizeActivity([
      r('2026-10-10', 3, 0),
      r('2026-10-10', 1, 2),
      r('2026-10-11', 3, 2),
    ]);
    expect(a['2026-10-10']).toEqual({ reviews: 2, correct: 1, newCards: 1, ms: 2000 });
  });

  it('期限切れは今日に、未学習は数えない', () => {
    const f = summarizeForecast(
      [
        { due: new Date(2026, 9, 1, 12).getTime(), state: 2, suspended: 0 },
        { due: new Date(2026, 9, 13, 12).getTime(), state: 2, suspended: 0 },
        { due: new Date(2026, 9, 13, 12).getTime(), state: 0, suspended: 0 },
      ],
      '2026-10-11',
      4,
    );
    expect(f).toEqual({ '2026-10-11': 1, '2026-10-13': 1 });
  });
});

describe('summarizeStates', () => {
  it('間隔 21 日以上を定着として数え、停止中は除く', () => {
    const c = (state: 0 | 1 | 2 | 3, scheduled_days = 0, suspended: 0 | 1 = 0) => ({
      state,
      scheduled_days,
      suspended,
    });
    expect(summarizeStates([c(0), c(1), c(3), c(2, 5), c(2, 21), c(2, 40), c(2, 40, 1)])).toEqual({
      newCards: 1,
      learning: 2,
      young: 1,
      mature: 2,
    });
  });
});

describe('itemStatus', () => {
  const c = (state: 0 | 1 | 2 | 3, scheduled_days = 0, suspended: 0 | 1 = 0) => ({
    state,
    scheduled_days,
    suspended,
  });
  it('項目のカードから状態を決める', () => {
    expect(itemStatus([c(0)])).toBe('new');
    expect(itemStatus([c(2, 30), c(1)])).toBe('learning');
    expect(itemStatus([c(2, 5)])).toBe('review');
    expect(itemStatus([c(2, 30), c(0)])).toBe('mature');
    expect(itemStatus([c(2, 30, 1)])).toBe('suspended');
  });
});

describe('yearStart', () => {
  it('今日を含む週から 52 週前の日曜日', () => {
    for (const today of ['2026-10-11', '2026-10-14', '2026-10-17']) {
      const start = yearStart(today);
      expect(parseDayKey(start).getDay()).toBe(0);
      const span = diffDays(start, today);
      expect(span).toBeGreaterThanOrEqual((YEAR_WEEKS - 1) * 7);
      expect(span).toBeLessThan(YEAR_WEEKS * 7);
    }
  });
});
