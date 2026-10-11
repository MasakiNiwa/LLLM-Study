import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import { installPack } from '@/lib/packs/install';
import { useStudy } from './studyStore';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await installPack(
    {
      format: 'lllm-study-pack',
      version: 1,
      id: 'p',
      title: 'P',
      items: Array.from({ length: 3 }, (_, i) => ({
        id: `w${i}`,
        type: 'vocab' as const,
        term: `word${i}`,
        meanings: ['意味'],
      })),
    },
    'import',
  );
  useStudy.getState().end();
});

describe('studyStore', () => {
  it('評価を連打しても、同じカードの記録は 1 件だけ保存する', async () => {
    await useStudy.getState().start();
    const first = useStudy.getState().current!.card.id;
    useStudy.getState().reveal();
    await Promise.all([useStudy.getState().rate(3), useStudy.getState().rate(3)]);
    const reviews = await db.reviews.toArray();
    expect(reviews.filter((r) => r.cardId === first)).toHaveLength(1);
    expect(useStudy.getState().stats.done).toBe(1);
  });

  it('おさらいは記録を残さない', async () => {
    await useStudy.getState().start();
    useStudy.getState().reveal();
    await useStudy.getState().rate(1);
    await useStudy.getState().startPractice('mistakes');
    expect(useStudy.getState().mode).toBe('practice');
    useStudy.getState().reveal();
    await useStudy.getState().rate(1);
    await useStudy.getState().rate(3);
    expect(await db.reviews.count()).toBe(1);
  });
});
