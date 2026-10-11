import { describe, expect, it } from 'vitest';
import type { CardRecord } from '@/lib/db/types';
import { buildQueue, requeuePosition } from './queue';

function card(id: string, state: CardRecord['state'], due: number): CardRecord {
  return {
    id,
    packId: 'p',
    itemKey: `p/${id}`,
    template: 'recognize',
    order: 0,
    suspended: 0,
    due,
    stability: 0,
    difficulty: 0,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    state,
  };
}

describe('buildQueue', () => {
  const reviews = Array.from({ length: 6 }, (_, i) => card(`r${i}`, 2, 100 - i));
  const newCards = Array.from({ length: 5 }, (_, i) => card(`n${i}`, 0, 0));

  it('新しいカードは上限まで、復習の間に均等に混ぜる', () => {
    const plan = buildQueue({
      learning: [card('l1', 1, 50)],
      reviews,
      newCards,
      newDoneToday: 3,
      reviewsDoneToday: 0,
      newPerDay: 5,
      maxReviewsPerDay: 100,
    });
    expect(plan.newCount).toBe(2);
    expect(plan.reviewCount).toBe(6);
    expect(plan.queue[0].id).toBe('l1');
    expect(plan.queue).toHaveLength(9);
    // 期限の古い順
    expect(plan.queue.filter((c) => c.state === 2)[0].id).toBe('r5');
    // 新しいカードが末尾に固まらない
    const idx = plan.queue.map((c) => c.id).indexOf('n0');
    expect(idx).toBeGreaterThan(1);
    expect(idx).toBeLessThan(8);
  });

  it('復習の上限を守る', () => {
    const plan = buildQueue({
      learning: [],
      reviews,
      newCards: [],
      newDoneToday: 0,
      reviewsDoneToday: 4,
      newPerDay: 0,
      maxReviewsPerDay: 5,
    });
    expect(plan.reviewCount).toBe(1);
  });
});

describe('requeuePosition', () => {
  it('学習中で予定が近いカードはセッション内に戻す', () => {
    const q = [card('a', 2, 0), card('b', 2, 0), card('c', 2, 0), card('d', 2, 0)];
    expect(requeuePosition(q, card('x', 1, 1000), 0, 20 * 60_000)).toBe(4);
    expect(requeuePosition(q, card('x', 2, 1000), 0, 20 * 60_000)).toBe(-1);
    expect(requeuePosition(q, card('x', 1, 30 * 60_000), 0, 20 * 60_000)).toBe(-1);
  });
});
