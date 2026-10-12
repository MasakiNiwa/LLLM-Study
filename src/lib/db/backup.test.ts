import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { installPack } from '@/lib/packs/install';
import {
  BACKUP_FORMAT,
  clearAllData,
  clearAllProgress,
  exportBackup,
  parseBackup,
  restoreBackup,
} from './backup';
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

  it('必須項目の欠けたレコードがあれば復元せず、今のデータを残す', async () => {
    const broken = JSON.stringify({
      format: BACKUP_FORMAT,
      version: 1,
      packs: [{ id: 'broken' }],
      items: [],
      cards: [],
      reviews: [],
      chat: [],
    });
    await expect(restoreBackup(broken)).rejects.toThrow(/正しくありません/);
    expect(await db.packs.get('broken')).toBeUndefined();
    expect(await db.items.count()).toBe(1);
    expect(await db.cards.count()).toBe(1);
  });

  it('参照先のないカード・重複した ID は拒否し、カードのない学習記録は除外する', async () => {
    const good = await exportBackup();
    const orphanCard = { ...(good.cards[0] as object), id: 'x/y#basic', itemKey: 'x/y' };
    expect(() =>
      parseBackup(JSON.stringify({ ...good, cards: [...good.cards, orphanCard] })),
    ).toThrow(/項目のないカード/);
    expect(() =>
      parseBackup(JSON.stringify({ ...good, packs: [...good.packs, ...good.packs] })),
    ).toThrow(/重複/);
    const review = {
      cardId: 'gone',
      packId: 'p',
      itemKey: 'p/a',
      rating: 3,
      state: 0,
      review: 1,
      day: '2026-01-01',
      durationMs: 1000,
      nextDue: 2,
      scheduled_days: 1,
      elapsed_days: 0,
      stability: 1,
      difficulty: 5,
      prev: { ...(good.cards[0] as object) },
    };
    const parsed = parseBackup(JSON.stringify({ ...good, reviews: [review] }));
    expect(parsed.skippedReviews).toBe(1);
    expect(parsed.reviews).toHaveLength(0);
  });

  it('設定を一緒に書き出して読み取れる', async () => {
    const b = await exportBackup({ settings: { newPerDay: 30 } });
    expect(parseBackup(JSON.stringify(b)).settings).toEqual({ newPerDay: 30 });
  });
});
