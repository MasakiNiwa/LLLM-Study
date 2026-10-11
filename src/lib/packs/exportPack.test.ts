import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import { exportPack } from './exportPack';
import { installPack } from './install';
import type { StudyPack } from './schema';

const pack: StudyPack = {
  format: 'lllm-study-pack',
  version: 1,
  id: 'p',
  title: 'P',
  subject: 'english',
  revision: 2,
  items: [
    { id: 'b', type: 'vocab', term: 'b', meanings: ['B'] },
    { id: 'a', type: 'qa', question: 'Q', answer: 'A' },
  ],
};

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('exportPack', () => {
  it('取り込んだ教材を元の形（項目の順番も）で書き出す', async () => {
    await installPack(pack, 'import');
    expect(await exportPack('p')).toEqual(pack);
  });
  it('本文（passages）も書き出し、取り込み時に項目へコピーする', async () => {
    const withPassage: StudyPack = {
      ...pack,
      passages: [{ id: 'p1', title: 'T', text: 'Long text.' }],
      items: [{ id: 'q', type: 'qa', question: 'Q', answer: 'A', passage: 'p1' }, pack.items[0]],
    };
    await installPack(withPassage, 'import');
    expect((await db.items.get('p/q'))?.passage?.text).toBe('Long text.');
    expect((await db.items.get('p/b'))?.passage).toBeUndefined();
    expect(await exportPack('p')).toEqual(withPassage);
  });
  it('無い教材はエラー', async () => {
    await expect(exportPack('nope')).rejects.toThrow();
  });
});
