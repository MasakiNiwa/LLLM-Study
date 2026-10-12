/**
 * 「理解を深める」練習の材料を教材から選ぶ（プログラムの役目）。
 * 思い出しにくくなっている項目から順に選び、AI に渡す短い要点にする。
 */
import { db } from '@/lib/db/db';
import type { StudyItem } from '@/lib/packs/schema';
import { clozeFull, itemAnswer, itemTitle } from '@/lib/packs/itemText';
import { retrievability } from '@/lib/srs/scheduler';

function clip(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 項目の要点（1 行） */
export function materialLine(item: StudyItem): string {
  const note =
    'explanation' in item && item.explanation
      ? item.explanation
      : 'notes' in item && item.notes
        ? item.notes
        : '';
  const main =
    item.type === 'cloze'
      ? clozeFull(item.text)
      : `${clip(itemTitle(item), 120)} → ${clip(itemAnswer(item), 80)}`;
  return note ? `${main}（${clip(note, 100)}）` : main;
}

export async function pickPackMaterial(
  packId: string,
  count: number,
  now = Date.now(),
): Promise<string[]> {
  const cards = (await db.cards.where('packId').equals(packId).toArray()).filter(
    (c) => !c.suspended,
  );
  // 項目ごとに一番思い出しにくいカードの確率で並べる（未学習はそのあと）
  const score = new Map<string, number>();
  for (const c of cards) {
    const r = c.state === 0 ? 2 : (retrievability(c, now) ?? 1);
    score.set(c.itemKey, Math.min(score.get(c.itemKey) ?? Infinity, r));
  }
  const keys = [...score.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, count)
    .map(([k]) => k);
  const items = await db.items.bulkGet(keys);
  return items.flatMap((it) => (it ? [materialLine(it.item)] : []));
}
