import { describe, expect, it } from 'vitest';
import type { StatsData } from '@/lib/data/stats';
import { reviewPrompt, summaryLines, weeklySummary } from './review';

function stats(reviews: number[]): StatsData {
  return {
    states: { newCards: 10, learning: 2, young: 5, mature: 3 },
    history: reviews.map((n, i) => ({
      day: `2026-10-${String(i + 1).padStart(2, '0')}`,
      reviews: n,
      correct: Math.round(n * 0.8),
      ms: n * 6000,
    })),
    forecast: Array.from({ length: 30 }, (_, i) => ({ day: `d${i}`, count: i < 7 ? 2 : 100 })),
    year: {},
    totalReviews: 0,
    totalMs: 0,
    studyDays: 0,
    averageRecall: 0.873,
  };
}

describe('weeklySummary', () => {
  it('この 7 日と前の 7 日を比べる', () => {
    const s = weeklySummary(
      stats([...Array(16).fill(0), 10, 10, 0, 0, 0, 0, 0, 20, 0, 10, 0, 10, 0, 10]),
    );
    expect(s.thisWeek).toEqual({ days: 4, reviews: 50, correctRate: 80, minutes: 5 });
    expect(s.lastWeek.reviews).toBe(20);
    expect(s.upcoming).toBe(14);
    expect(s.averageRecall).toBe(87);
    expect(summaryLines(s)[0]).toBe('この 7 日間: 4 日・50 回（先週より +30 回）・5 分');
  });

  it('学習していない週は予定だけを伝える', () => {
    const s = weeklySummary(stats(Array(30).fill(0)));
    expect(summaryLines(s)).toEqual([
      'この 7 日間はまだ学習していません。',
      'これから 7 日で 14 枚の復習が予定されています。',
    ]);
  });

  it('AI には集計済みの数字を JSON で渡す', () => {
    const s = weeklySummary(stats(Array(30).fill(5)));
    const p = reviewPrompt(s, [{ title: 'take', lapses: 3 }], 'すべての教材');
    const json = JSON.parse(p.split('<study_week>')[1].split('</study_week>')[0]);
    expect(json.this_week.reviews).toBe(35);
    expect(json.weak_items).toEqual([{ title: 'take', lapses: 3 }]);
  });
});
