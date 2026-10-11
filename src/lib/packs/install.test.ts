import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import type { StudyPack } from './schema';
import {
  installPack,
  movePack,
  resetPackProgress,
  setPackTemplates,
  uninstallPack,
  updatePackItem,
} from './install';

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

  it('並び順を入れ替える', async () => {
    await installPack(pack([w('a')]), 'import');
    await installPack({ ...pack([w('b')]), id: 'p2', title: 'P2' }, 'import');
    await movePack('p2', -1);
    expect((await db.packs.orderBy('order').toArray()).map((p) => p.id)).toEqual(['p2', 'p1']);
    await movePack('p2', -1); // 先頭より上には動かない
    expect((await db.packs.orderBy('order').first())?.id).toBe('p2');
  });

  it('項目を 1 つ直す（学習記録は残し、種類と ID は変えられない）', async () => {
    await installPack(pack([w('a', 'tke'), w('b')]), 'import');
    const card = (await db.cards.where('itemKey').equals('p1/a').first())!;
    await db.cards.put({ ...card, reps: 3 });
    await updatePackItem('p1/a', w('a', 'take'));
    const rec = await db.items.get('p1/a');
    expect(rec?.item).toMatchObject({ term: 'take' });
    expect((await db.cards.get(card.id))?.reps).toBe(3);
    await expect(updatePackItem('p1/a', w('x'))).rejects.toThrow('ID');
    await expect(
      updatePackItem('p1/a', { id: 'a', type: 'qa', question: 'q', answer: 'a' }),
    ).rejects.toThrow('種類');
    await expect(updatePackItem('p1/a', { ...w('a'), passage: 'nope' })).rejects.toThrow('本文');
  });
});
