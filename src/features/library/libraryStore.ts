import { create } from 'zustand';
import { db } from '@/lib/db/db';
import { CardState, type PackRecord } from '@/lib/db/types';

export interface PackStats {
  cards: number;
  newCards: number;
  learning: number;
  review: number;
  suspended: number;
  /** 期限が来ている（今すぐ復習できる）カード */
  due: number;
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
  // 型を外して休止しているカード（suspended = 2）は数えない
  const cards = (await db.cards.where('packId').equals(packId).toArray()).filter(
    (c) => c.suspended !== 2,
  );
  const s: PackStats = {
    cards: cards.length,
    newCards: 0,
    learning: 0,
    review: 0,
    suspended: 0,
    due: 0,
  };
  const now = Date.now();
  for (const c of cards) {
    if (c.state !== CardState.New && !c.suspended && c.due <= now) s.due++;
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
