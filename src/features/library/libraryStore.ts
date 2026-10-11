import { create } from 'zustand';
import { db } from '@/lib/db/db';
import { CardState, type PackRecord } from '@/lib/db/types';

export interface PackStats {
  cards: number;
  newCards: number;
  learning: number;
  review: number;
  suspended: number;
}

export interface PackWithStats extends PackRecord {
  stats: PackStats;
}

interface LibraryState {
  loaded: boolean;
  packs: PackWithStats[];
  refresh: () => Promise<void>;
}

async function statsOf(packId: string): Promise<PackStats> {
  const cards = await db.cards.where('packId').equals(packId).toArray();
  const s: PackStats = { cards: cards.length, newCards: 0, learning: 0, review: 0, suspended: 0 };
  for (const c of cards) {
    if (c.suspended) s.suspended++;
    if (c.state === CardState.New) s.newCards++;
    else if (c.state === CardState.Review) s.review++;
    else s.learning++;
  }
  return s;
}

/** 取り込んだ教材の一覧（ホーム・教材画面で共有） */
export const useLibrary = create<LibraryState>()((set) => ({
  loaded: false,
  packs: [],
  async refresh() {
    const packs = await db.packs.orderBy('order').toArray();
    const withStats = await Promise.all(
      packs.map(async (p) => ({ ...p, stats: await statsOf(p.id) })),
    );
    set({ packs: withStats, loaded: true });
  },
}));
