/**
 * 教材パックの取り込み・更新・削除（DB 操作）。
 *
 * 同じ ID のパックを取り込むと「更新」として扱い、同じ項目 ID の学習記録はそのまま引き継ぐ。
 * 消えた項目のカードと記録は削除する。
 */
import { notifyLibraryChange } from '@/lib/db/changes';
import { db } from '@/lib/db/db';
import type { CardRecord, ItemRecord, PackOrigin, PackRecord } from '@/lib/db/types';
import { newFsrsFields } from '@/lib/srs/scheduler';
import type { ItemType, StudyItem, StudyPack } from './schema';
import { defaultTemplates } from './templates';

export interface InstallSummary {
  packId: string;
  created: boolean;
  added: number;
  updated: number;
  removed: number;
}

export function itemKey(packId: string, itemId: string): string {
  return `${packId}/${itemId}`;
}

export function cardId(key: string, template: string): string {
  return `${key}#${template}`;
}

/**
 * パックの有効なカードの型に従って、足りないカードを作り、なくなった項目のカードを消す。
 * 外したカードの型のカードは消さずに休止（suspended = 2）にして、学習記録を残す（戻せば再開）。
 */
async function syncCards(pack: PackRecord, items: ItemRecord[], now: number): Promise<void> {
  const existing = await db.cards.where('packId').equals(pack.id).toArray();
  const byId = new Map(existing.map((c) => [c.id, c]));
  const itemKeys = new Set(items.map((i) => i.key));
  // 項目ごとに出題を止めているか（型を戻したカードにも引き継ぐ）
  const itemSuspended = new Set(existing.filter((c) => c.suspended === 1).map((c) => c.itemKey));
  const wanted = new Set<string>();
  const toAdd: CardRecord[] = [];
  const toPut: CardRecord[] = [];
  const fresh = newFsrsFields(now);
  for (const it of items) {
    for (const template of pack.templates[it.item.type] ?? []) {
      const id = cardId(it.key, template);
      wanted.add(id);
      const prev = byId.get(id);
      if (!prev) {
        toAdd.push({
          ...fresh,
          id,
          packId: pack.id,
          itemKey: it.key,
          template,
          order: it.order,
          suspended: itemSuspended.has(it.key) ? 1 : 0,
        });
      } else if (prev.order !== it.order || prev.suspended === 2) {
        const suspended =
          prev.suspended === 2 ? (itemSuspended.has(it.key) ? 1 : 0) : prev.suspended;
        toPut.push({ ...prev, order: it.order, suspended });
      }
    }
  }
  // 項目ごと消えたカードは記録ごと削除、型を外しただけのカードは休止にする
  const toDelete = existing.filter((c) => !itemKeys.has(c.itemKey)).map((c) => c.id);
  for (const c of existing) {
    if (itemKeys.has(c.itemKey) && !wanted.has(c.id) && c.suspended !== 2) {
      toPut.push({ ...c, suspended: 2 });
    }
  }
  await db.cards.bulkAdd(toAdd);
  if (toPut.length) await db.cards.bulkPut(toPut);
  if (toDelete.length) {
    await db.cards.bulkDelete(toDelete);
    await db.reviews.where('cardId').anyOf(toDelete).delete();
  }
}

export async function installPack(
  pack: StudyPack,
  origin: PackOrigin,
  options: { sampleFile?: string; now?: number } = {},
): Promise<InstallSummary> {
  const now = options.now ?? Date.now();
  const summary = await db.transaction(
    'rw',
    [db.packs, db.items, db.cards, db.reviews],
    async () => {
      const prev = await db.packs.get(pack.id);
      const { items, format: _f, version: _v, ...meta } = pack;
      const itemTypes = [...new Set(items.map((i) => i.type))] as ItemType[];
      // 既存のパックはカードの型の選択を引き継ぎ、新しく増えた種類だけ既定値にする
      const templates = { ...defaultTemplates(itemTypes), ...(prev?.templates ?? {}) };
      const maxOrder = (await db.packs.orderBy('order').last())?.order ?? 0;
      const record: PackRecord = {
        ...meta,
        origin,
        sampleFile: options.sampleFile ?? prev?.sampleFile,
        itemCount: items.length,
        itemTypes,
        installedAt: prev?.installedAt ?? now,
        updatedAt: now,
        enabled: prev?.enabled ?? true,
        templates,
        order: prev?.order ?? maxOrder + 1,
      };

      const oldItems = await db.items.where('packId').equals(pack.id).toArray();
      const oldKeys = new Set(oldItems.map((i) => i.key));
      const passages = new Map((pack.passages ?? []).map((p) => [p.id, p]));
      const itemRecords: ItemRecord[] = items.map((item, order) => {
        const passage = item.passage ? passages.get(item.passage) : undefined;
        return {
          key: itemKey(pack.id, item.id),
          packId: pack.id,
          itemId: item.id,
          order,
          item,
          ...(passage && { passage }),
        };
      });
      const newKeys = new Set(itemRecords.map((i) => i.key));
      const removedKeys = [...oldKeys].filter((k) => !newKeys.has(k));

      await db.packs.put(record);
      if (removedKeys.length) await db.items.bulkDelete(removedKeys);
      await db.items.bulkPut(itemRecords);
      await syncCards(record, itemRecords, now);

      return {
        packId: pack.id,
        created: !prev,
        added: itemRecords.filter((i) => !oldKeys.has(i.key)).length,
        updated: itemRecords.filter((i) => oldKeys.has(i.key)).length,
        removed: removedKeys.length,
      };
    },
  );
  notifyLibraryChange([pack.id]);
  return summary;
}

/** カードの型の選択を変える（増えた型のカードを作り、外した型のカードは記録を残したまま休止にする） */
export async function setPackTemplates(
  packId: string,
  templates: Partial<Record<ItemType, string[]>>,
): Promise<void> {
  await db.transaction('rw', [db.packs, db.items, db.cards, db.reviews], async () => {
    const pack = await db.packs.get(packId);
    if (!pack) return;
    const next = { ...pack, templates, updatedAt: Date.now() };
    await db.packs.put(next);
    const items = await db.items.where('packId').equals(packId).toArray();
    await syncCards(next, items, Date.now());
  });
  notifyLibraryChange([packId]);
}

export async function setPackEnabled(packId: string, enabled: boolean): Promise<void> {
  await db.packs.update(packId, { enabled });
  notifyLibraryChange([packId]);
}

/** パックと、その学習記録をすべて削除する */
export async function uninstallPack(packId: string): Promise<void> {
  await db.transaction('rw', [db.packs, db.items, db.cards, db.reviews], async () => {
    const cardIds = await db.cards.where('packId').equals(packId).primaryKeys();
    await db.reviews.where('cardId').anyOf(cardIds).delete();
    await db.cards.where('packId').equals(packId).delete();
    await db.items.where('packId').equals(packId).delete();
    await db.packs.delete(packId);
  });
  notifyLibraryChange([packId]);
}

/** パックの学習記録だけを消して、最初からやり直す */
export async function resetPackProgress(packId: string): Promise<void> {
  await db.transaction('rw', [db.cards, db.reviews], async () => {
    const cards = await db.cards.where('packId').equals(packId).toArray();
    await db.reviews
      .where('cardId')
      .anyOf(cards.map((c) => c.id))
      .delete();
    const fresh = newFsrsFields(Date.now());
    await db.cards.bulkPut(
      cards.map((c) => ({ ...c, ...fresh, suspended: c.suspended, introducedDay: undefined })),
    );
  });
  notifyLibraryChange([packId]);
}

/**
 * 教材の並び順を 1 つ上（-1）・下（+1）に動かす。
 * 並び順は一覧の表示順と、新しいカードを出す優先順位に使う。
 */
export async function movePack(packId: string, direction: -1 | 1): Promise<void> {
  await db.transaction('rw', db.packs, async () => {
    const packs = await db.packs.orderBy('order').toArray();
    const i = packs.findIndex((p) => p.id === packId);
    const j = i + direction;
    if (i < 0 || j < 0 || j >= packs.length) return;
    // order が重複していても確実に入れ替わるよう、全体を振り直す
    [packs[i], packs[j]] = [packs[j], packs[i]];
    await db.packs.bulkPut(packs.map((p, k) => ({ ...p, order: k + 1 })));
  });
}

/**
 * 取り込んだ教材の項目を 1 つだけ直す（誤字の修正など）。学習記録はそのまま残す。
 * 種類と ID は変えられない（カードの型と学習記録が項目の種類・ID に結びついているため）。
 * 教材を取り込み直す（サンプルの更新を含む）と、ここでの修正は上書きされる。
 */
export async function updatePackItem(key: string, item: StudyItem): Promise<void> {
  await db.transaction('rw', [db.packs, db.items], async () => {
    const rec = await db.items.get(key);
    if (!rec) throw new Error('項目が見つかりません');
    if (rec.item.type !== item.type) throw new Error('項目の種類は変えられません');
    if (rec.item.id !== item.id) throw new Error('項目の ID は変えられません');
    const pack = await db.packs.get(rec.packId);
    if (!pack) throw new Error('教材が見つかりません');
    const passage = item.passage ? pack.passages?.find((p) => p.id === item.passage) : undefined;
    if (item.passage && !passage) throw new Error(`本文「${item.passage}」がこの教材にありません`);
    const { passage: _old, ...rest } = rec;
    await db.items.put({ ...rest, item, ...(passage && { passage }) });
    await db.packs.update(pack.id, { updatedAt: Date.now() });
  });
  notifyLibraryChange([key.slice(0, key.lastIndexOf('/'))]);
}
