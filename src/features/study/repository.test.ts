import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import { installPack } from '@/lib/packs/install';
import { DEFAULT_SETTINGS } from '@/features/settings/settingsStore';
import { getTodayOverview, loadQueue, saveRating, undoRating } from './repository';

const settings = { ...DEFAULT_SETTINGS, newPerDay: 3, fuzz: false };
const now = new Date(2026, 9, 11, 9).getTime();

beforeEach(async () => {
  await db.delete();
  await db.open();
  await installPack(
    {
      format: 'lllm-study-pack',
      version: 1,
      id: 'p',
      title: 'P',
      items: Array.from({ length: 5 }, (_, i) => ({
        id: `w${i}`,
        type: 'vocab' as const,
        term: `word${i}`,
        meanings: ['意味'],
      })),
    },
    'import',
    { now },
  );
});

describe('repository', () => {
  it('新しいカードを上限まで出す（教材の順）', async () => {
    const plan = await loadQueue(settings, now);
    expect(plan.newCount).toBe(3);
    expect(plan.queue.map((c) => c.itemKey)).toEqual(['p/w0', 'p/w1', 'p/w2']);
  });

  it('評価を保存すると今日の数に反映され、取り消せる', async () => {
    const [first] = (await loadQueue(settings, now)).queue;
    const { card, reviewId } = await saveRating(first, 3, 4000, settings, now);
    expect(card.reps).toBe(1);
    expect(card.introducedDay).toBe('2026-10-11');

    const overview = await getTodayOverview(settings, now + 1000);
    expect(overview.newDone).toBe(1);
    expect(overview.reviewsDone).toBe(1);
    expect(overview.streak).toBe(1);
    // 学習中のカードとして残り、新しいカードは残り 2 枚
    const plan = await loadQueue(settings, now + 60 * 60_000);
    expect(plan.newCount).toBe(2);
    expect(plan.learningCount).toBe(1);

    const restored = await undoRating(reviewId);
    expect(restored?.reps).toBe(0);
    expect(restored?.introducedDay).toBeUndefined();
    expect(await db.reviews.count()).toBe(0);
  });

  it('無効にしたパックは出題しない', async () => {
    await db.packs.update('p', { enabled: false });
    expect((await loadQueue(settings, now)).queue).toHaveLength(0);
  });
});

describe('教材の切り替えと上限なし', () => {
  beforeEach(async () => {
    await installPack(
      {
        format: 'lllm-study-pack',
        version: 1,
        id: 'q',
        title: 'Q',
        items: Array.from({ length: 4 }, (_, i) => ({
          id: `x${i}`,
          type: 'qa' as const,
          question: `Q${i}`,
          answer: 'A',
        })),
      },
      'import',
      { now },
    );
  });

  it('教材を絞るとその教材だけ出し、上限もその教材の中で数える', async () => {
    const [first] = (await loadQueue(settings, now)).queue;
    await saveRating(first, 3, 1000, settings, now);
    const plan = await loadQueue({ ...settings, focusPackId: 'q' }, now + 1000);
    expect(plan.queue.every((c) => c.packId === 'q')).toBe(true);
    expect(plan.newCount).toBe(3);
  });

  it('無効にした教材でも、絞り込めば学習できる', async () => {
    await db.packs.update('q', { enabled: false });
    expect((await loadQueue({ ...settings, focusPackId: 'q' }, now)).newCount).toBe(3);
  });

  it('上限なしなら新しいカードをすべて出す', async () => {
    expect((await loadQueue({ ...settings, noDailyLimit: true }, now)).newCount).toBe(9);
  });
});

describe('出題を止める', () => {
  it('止めた項目のカードは出題しない', async () => {
    const { setItemSuspended } = await import('./cardActions');
    await setItemSuspended('p/w0', true);
    const plan = await loadQueue(settings, now);
    expect(plan.queue.some((c) => c.itemKey === 'p/w0')).toBe(false);
    await setItemSuspended('p/w0', false);
    expect((await loadQueue(settings, now)).queue[0].itemKey).toBe('p/w0');
  });
});
