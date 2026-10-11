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
  it('無い教材はエラー', async () => {
    await expect(exportPack('nope')).rejects.toThrow();
  });
});
