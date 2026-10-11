/**
 * 学習セッション（今日のキューを 1 枚ずつ出題し、評価を保存する）。
 *
 * 出題順と次回の予定はアルゴリズム（FSRS・キュー）が決め、
 * AI は評価への「ひとこと」や解説を上乗せするだけにする。
 */
import { toast } from 'sonner';
import { create } from 'zustand';
import { db } from '@/lib/db/db';
import type { CardRecord, GradeValue, ItemRecord } from '@/lib/db/types';
import { requeuePosition } from '@/lib/srs/queue';
import { errorMessage } from '@/lib/utils/format';
import { useAiFocus } from '@/features/ai/focusStore';
import { getPersona, reactionText } from '@/features/ai/personas';
import { useSettings } from '@/features/settings/settingsStore';
import { LEARN_AHEAD_MS, loadQueue, saveRating, undoRating } from './repository';

export interface StudyCard {
  card: CardRecord;
  item: ItemRecord;
}

export interface SessionStats {
  done: number;
  ratings: Record<GradeValue, number>;
  correctStreak: number;
  bestStreak: number;
  startedAt: number;
}

interface UndoEntry {
  reviewId: number;
  before: CardRecord;
  /** 評価後にキューへ戻した場合の位置（取り消し時に取り除く） */
  requeued: boolean;
  statsBefore: SessionStats;
}

export interface LastRating {
  grade: GradeValue;
  cardId: string;
  /** 次回の予定（エポックミリ秒） */
  nextDue: number;
  at: number;
  /** アプリがテンプレートから選んだひとこと */
  reaction: string;
  /** 評価した時点のセッションの状況（AI のひとこと用） */
  done: number;
  correctStreak: number;
}

interface StudyState {
  status: 'idle' | 'loading' | 'studying' | 'done';
  queue: CardRecord[];
  current: StudyCard | null;
  revealed: boolean;
  shownAt: number;
  /** 最初のキューの内訳（進捗表示用） */
  planned: { new: number; review: number; learning: number };
  stats: SessionStats;
  undoStack: UndoEntry[];
  lastRating: LastRating | null;
  start: () => Promise<void>;
  reveal: () => void;
  rate: (grade: GradeValue) => Promise<void>;
  undo: () => Promise<void>;
  end: () => void;
}

function emptyStats(): SessionStats {
  return {
    done: 0,
    ratings: { 1: 0, 2: 0, 3: 0, 4: 0 },
    correctStreak: 0,
    bestStreak: 0,
    startedAt: Date.now(),
  };
}

async function withItem(card: CardRecord): Promise<StudyCard | null> {
  const item = await db.items.get(card.itemKey);
  return item ? { card, item } : null;
}

export const useStudy = create<StudyState>()((set, get) => {
  /** キューの先頭から、項目が見つかるカードを取り出して表示する */
  const showNext = async (queue: CardRecord[]) => {
    const rest = [...queue];
    while (rest.length > 0) {
      const next = await withItem(rest[0]);
      if (next) {
        set({
          queue: rest,
          current: next,
          revealed: false,
          shownAt: Date.now(),
          status: 'studying',
        });
        useAiFocus.getState().setStudyCard(next.card.id, false);
        return;
      }
      rest.shift();
    }
    set({ queue: [], current: null, revealed: false, status: 'done' });
    useAiFocus.getState().setStudyCard(null, false);
  };

  return {
    status: 'idle',
    queue: [],
    current: null,
    revealed: false,
    shownAt: 0,
    planned: { new: 0, review: 0, learning: 0 },
    stats: emptyStats(),
    undoStack: [],
    lastRating: null,

    async start() {
      set({ status: 'loading', stats: emptyStats(), undoStack: [], lastRating: null });
      try {
        const plan = await loadQueue(useSettings.getState());
        set({
          planned: { new: plan.newCount, review: plan.reviewCount, learning: plan.learningCount },
        });
        await showNext(plan.queue);
      } catch (e) {
        console.error(e);
        toast.error('学習を始められませんでした', { description: errorMessage(e) });
        set({ status: 'idle' });
      }
    },

    reveal() {
      if (!get().current || get().revealed) return;
      set({ revealed: true });
      useAiFocus.getState().setStudyCard(get().current!.card.id, true);
    },

    async rate(grade) {
      const { current, queue, shownAt, stats } = get();
      if (!current) return;
      const now = Date.now();
      try {
        const { card, reviewId } = await saveRating(
          current.card,
          grade,
          now - shownAt,
          useSettings.getState(),
          now,
        );
        const rest = queue.slice(1);
        const pos = requeuePosition(rest, card, now, LEARN_AHEAD_MS);
        if (pos >= 0) rest.splice(pos, 0, card);
        const correct = grade >= 3;
        const correctStreak = correct ? stats.correctStreak + 1 : 0;
        set({
          stats: {
            ...stats,
            done: stats.done + 1,
            ratings: { ...stats.ratings, [grade]: stats.ratings[grade] + 1 },
            correctStreak,
            bestStreak: Math.max(stats.bestStreak, correctStreak),
          },
          undoStack: [
            ...get().undoStack.slice(-19),
            { reviewId, before: current.card, requeued: pos >= 0, statsBefore: stats },
          ],
          lastRating: {
            grade,
            cardId: card.id,
            nextDue: card.due,
            at: now,
            reaction: reactionText(
              getPersona(useSettings.getState().persona, useSettings.getState().customPersona),
              grade,
              correctStreak,
            ),
            done: stats.done + 1,
            correctStreak,
          },
        });
        await showNext(rest);
      } catch (e) {
        console.error(e);
        toast.error('評価を保存できませんでした', { description: errorMessage(e) });
      }
    },

    async undo() {
      const stack = [...get().undoStack];
      const entry = stack.pop();
      if (!entry) return;
      try {
        const restored = await undoRating(entry.reviewId);
        if (!restored) return;
        let rest = get().current ? [...get().queue] : [];
        if (entry.requeued) rest = rest.filter((c) => c.id !== entry.before.id);
        set({ undoStack: stack, stats: entry.statsBefore, lastRating: null });
        await showNext([restored, ...rest]);
        toast('直前の評価を取り消しました');
      } catch (e) {
        toast.error('取り消せませんでした', { description: errorMessage(e) });
      }
    },

    end() {
      set({ status: 'idle', queue: [], current: null, revealed: false });
      useAiFocus.getState().setStudyCard(null, false);
    },
  };
});
