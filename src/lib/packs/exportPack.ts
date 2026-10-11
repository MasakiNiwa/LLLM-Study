/**
 * 取り込んだ教材を、教材パック形式（JSON）として書き出す。
 * 他の人と共有したり、外部 AI に「この教材の続きを作って」と渡したりできる。
 */
import { db } from '@/lib/db/db';
import { PACK_FORMAT, PACK_VERSION, PackSchema, type StudyPack } from './schema';

export async function exportPack(packId: string): Promise<StudyPack> {
  const pack = await db.packs.get(packId);
  if (!pack) throw new Error('教材が見つかりません');
  const items = await db.items.where('packId').equals(packId).sortBy('order');
  return PackSchema.parse({
    format: PACK_FORMAT,
    version: PACK_VERSION,
    id: pack.id,
    title: pack.title,
    description: pack.description,
    subject: pack.subject,
    language: pack.language,
    level: pack.level,
    tags: pack.tags,
    author: pack.author,
    license: pack.license,
    source: pack.source,
    revision: pack.revision,
    items: items.map((i) => i.item),
  });
}
