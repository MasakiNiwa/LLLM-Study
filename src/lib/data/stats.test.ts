import { describe, expect, it } from 'vitest';
import type { ReviewRecord } from '@/lib/db/types';
import { summarizeActivity, summarizeForecast } from './stats';

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
