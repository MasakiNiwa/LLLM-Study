/**
 * マイカード（自分で作るカード）。1 つの教材パック「マイカード」として持ち、
 * 追加・編集・削除のたびにパック全体を検証して取り込み直す（学習記録は項目 ID で引き継がれる）。
 */
import { db } from '@/lib/db/db';
import { installPack } from './install';
import { PACK_FORMAT, PACK_VERSION, PackSchema, type StudyItem, type StudyPack } from './schema';

export const USER_PACK_ID = 'my-cards';

/** 項目の ID を除いた中身（作成・編集フォームの値） */
export type UserItemDraft = StudyItem extends infer T
  ? T extends StudyItem
    ? Omit<T, 'id'>
    : never
  : never;

async function currentItems(): Promise<StudyItem[]> {
  const items = await db.items.where('packId').equals(USER_PACK_ID).sortBy('order');
  return items.map((i) => i.item);
}

async function save(items: StudyItem[]): Promise<void> {
  if (items.length === 0) {
    // 項目が 0 になったらパックごと消す（空のパックは形式上作れない）
    const { uninstallPack } = await import('./install');
    await uninstallPack(USER_PACK_ID);
    return;
  }
  const existing = await db.packs.get(USER_PACK_ID);
  const pack: StudyPack = PackSchema.parse({
    format: PACK_FORMAT,
    version: PACK_VERSION,
    id: USER_PACK_ID,
    title: existing?.title ?? 'マイカード',
    description: existing?.description ?? '自分で作ったカード',
    items,
  });
  await installPack(pack, 'user');
}

export function newUserItemId(now = Date.now()): string {
  return `u-${now.toString(36)}-${Math.floor(Math.random() * 1296).toString(36)}`;
}

export async function addUserItem(draft: UserItemDraft): Promise<string> {
  const id = newUserItemId();
  await save([...(await currentItems()), { ...draft, id } as StudyItem]);
  return id;
}

export async function updateUserItem(id: string, draft: UserItemDraft): Promise<void> {
  const items = await currentItems();
  if (!items.some((i) => i.id === id)) throw new Error('カードが見つかりません');
  await save(items.map((i) => (i.id === id ? ({ ...draft, id } as StudyItem) : i)));
}

export async function deleteUserItem(id: string): Promise<void> {
  await save((await currentItems()).filter((i) => i.id !== id));
}
