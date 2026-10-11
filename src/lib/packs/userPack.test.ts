import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import { addUserItem, deleteUserItem, updateUserItem, USER_PACK_ID } from './userPack';

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('userPack', () => {
  it('追加するとマイカードのパックができ、カードが作られる', async () => {
    const id = await addUserItem({ type: 'vocab', term: 'serendipity', meanings: ['偶然の幸運'] });
    const pack = await db.packs.get(USER_PACK_ID);
    expect(pack).toMatchObject({ origin: 'user', itemCount: 1 });
    expect(await db.cards.get(`${USER_PACK_ID}/${id}#recognize`)).toBeDefined();
  });

  it('編集しても学習記録は残り、削除で 0 件になるとパックも消える', async () => {
    const id = await addUserItem({ type: 'qa', question: 'Q', answer: 'A' });
    await db.cards.update(`${USER_PACK_ID}/${id}#basic`, { reps: 3 });
    await updateUserItem(id, { type: 'qa', question: 'Q2', answer: 'A2' });
    expect((await db.cards.get(`${USER_PACK_ID}/${id}#basic`))?.reps).toBe(3);
    expect((await db.items.get(`${USER_PACK_ID}/${id}`))?.item).toMatchObject({ question: 'Q2' });
    await deleteUserItem(id);
    expect(await db.packs.get(USER_PACK_ID)).toBeUndefined();
  });

  it('形式に合わない内容は保存しない', async () => {
    await expect(addUserItem({ type: 'vocab', term: '', meanings: [] })).rejects.toThrow();
    expect(await db.packs.count()).toBe(0);
  });
});
