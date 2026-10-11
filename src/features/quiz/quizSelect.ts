/**
 * AI 例文クイズに出す項目を選ぶ（プログラムの役目）。
 * 学習済みの単語・フレーズのうち、いま思い出せる確率が低いものから選ぶ。
 * 学習済みが足りなければ、まだ学習していない項目で補う。
 */
import { db } from '@/lib/db/db';
import { retrievability } from '@/lib/srs/scheduler';
import type { QuizSource } from './quizGen';

export interface QuizPick {
  itemKey: string;
  item: QuizSource;
}

export async function pickQuizItems(count: number, now = Date.now()): Promise<QuizPick[]> {
  const enabled = new Set((await db.packs.toArray()).filter((p) => p.enabled).map((p) => p.id));
  const cards = (await db.cards.toArray()).filter((c) => enabled.has(c.packId) && !c.suspended);
  // 項目ごとに一番思い出しにくいカードの確率で並べる
  const score = new Map<string, number>();
  for (const c of cards) {
    const r = c.state === 0 ? 2 : (retrievability(c, now) ?? 1); // 未学習は後回し
    score.set(c.itemKey, Math.min(score.get(c.itemKey) ?? Infinity, r));
  }
  const keys = [...score.entries()].sort((a, b) => a[1] - b[1]).map(([k]) => k);
  const picks: QuizPick[] = [];
  for (let i = 0; i < keys.length && picks.length < count; i += 50) {
    const items = await db.items.bulkGet(keys.slice(i, i + 50));
    for (const it of items) {
      if (it && (it.item.type === 'vocab' || it.item.type === 'phrase')) {
        picks.push({ itemKey: it.key, item: it.item });
        if (picks.length >= count) break;
      }
    }
  }
  return picks;
}
