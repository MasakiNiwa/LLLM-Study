import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import type { StudyPack } from './schema';
import { installPack, resetPackProgress, setPackTemplates, uninstallPack } from './install';

function pack(items: StudyPack['items']): StudyPack {
  return { format: 'lllm-study-pack', version: 1, id: 'p1', title: 'P1', items };
}

const w = (id: string, term = id) => ({
  id,
  type: 'vocab' as const,
  term,
  meanings: ['意味'],
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('installPack', () => {
  it('項目ごとに既定のカードを作る', async () => {
    const s = await installPack(pack([w('a'), w('b')]), 'import');
    expect(s).toMatchObject({ created: true, added: 2 });
    expect(await db.cards.count()).toBe(2);
    const p = await db.packs.get('p1');
    expect(p?.templates.vocab).toEqual(['recognize']);
  });

  it('更新時は学習記録を引き継ぎ、消えた項目は削除する', async () => {
    await installPack(pack([w('a'), w('b')]), 'import');
    await db.cards.update('p1/a#recognize', { reps: 5, state: 2 });
    const s = await installPack(pack([w('a', 'apple'), w('c')]), 'import');
    expect(s).toMatchObject({ created: false, added: 1, updated: 1, removed: 1 });
    expect((await db.cards.get('p1/a#recognize'))?.reps).toBe(5);
    expect(await db.cards.get('p1/b#recognize')).toBeUndefined();
    expect((await db.items.get('p1/a'))?.item).toMatchObject({ term: 'apple' });
  });

  it('カードの型を増やす・減らす', async () => {
    await installPack(pack([w('a')]), 'import');
    await setPackTemplates('p1', { vocab: ['recognize', 'recall'] });
    expect(await db.cards.count()).toBe(2);
    await setPackTemplates('p1', { vocab: ['recall'] });
    expect((await db.cards.toArray()).map((c) => c.id)).toEqual(['p1/a#recall']);
  });

  it('やり直しと削除', async () => {
    await installPack(pack([w('a')]), 'import');
    await db.cards.update('p1/a#recognize', { reps: 3, state: 2 });
    await resetPackProgress('p1');
    expect((await db.cards.get('p1/a#recognize'))?.reps).toBe(0);
    await uninstallPack('p1');
    expect(await db.packs.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    expect(await db.items.count()).toBe(0);
  });
});
