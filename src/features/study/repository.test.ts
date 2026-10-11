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
