import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { installPack } from '@/lib/packs/install';
import { clearAllData, clearAllProgress, exportBackup, restoreBackup } from './backup';
import { db } from './db';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await installPack(
    {
      format: 'lllm-study-pack',
      version: 1,
      id: 'p',
      title: 'P',
      items: [{ id: 'a', type: 'qa', question: 'Q', answer: 'A' }],
    },
    'import',
  );
});

describe('backup', () => {
  it('書き出して復元できる', async () => {
    await db.cards.update('p/a#basic', { reps: 4, state: 2 });
    const json = JSON.stringify(await exportBackup());
    await clearAllData();
    expect(await db.packs.count()).toBe(0);
    const r = await restoreBackup(json);
    expect(r.packs).toBe(1);
    expect((await db.cards.get('p/a#basic'))?.reps).toBe(4);
  });

  it('別のファイルは拒否する', async () => {
    await expect(restoreBackup('{"format":"other"}')).rejects.toThrow();
    await expect(restoreBackup('not json')).rejects.toThrow();
    expect(await db.packs.count()).toBe(1);
  });

  it('学習記録だけを消す', async () => {
    await db.cards.update('p/a#basic', { reps: 4, state: 2 });
    await clearAllProgress();
    expect((await db.cards.get('p/a#basic'))?.reps).toBe(0);
    expect(await db.packs.count()).toBe(1);
  });
});
