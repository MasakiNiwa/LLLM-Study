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
import { speechLang } from '@/lib/speech/lang';
import { errorMessage } from '@/lib/utils/format';
import { useAiFocus } from '@/features/ai/focusStore';
import { getPersona, reactionText } from '@/features/ai/personas';
import { useSettings } from '@/features/settings/settingsStore';
import { setItemSuspended } from './cardActions';
import { refreshAppBadge } from './appBadge';
import {
  LEARN_AHEAD_MS,
  loadPracticeCards,
  loadQueue,
  saveRating,
  undoRating,
  type PracticeKind,
} from './repository';

export interface StudyCard {
  card: CardRecord;
  item: ItemRecord;
  /** 読み上げに使う言語タグ（教材の学ぶ言語） */
  lang: string;
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

/** srs: 今日の学習（評価を記録してスケジュールを進める）、practice: おさらい（記録しない） */
export type StudyMode = 'srs' | 'practice';

/** おさらいで「もう一度」「難しい」にしたカードを、何枚あとにもう一度出すか */
const PRACTICE_REQUEUE: Partial<Record<GradeValue, number>> = { 1: 2, 2: 5 };

interface StudyState {
  status: 'idle' | 'loading' | 'studying' | 'done';
  mode: StudyMode;
  practiceKind: PracticeKind | null;
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
  /** おさらいを始める（評価は記録せず、スケジュールも変えない） */
  startPractice: (kind: PracticeKind) => Promise<void>;
  reveal: () => void;
  rate: (grade: GradeValue) => Promise<void>;
  undo: () => Promise<void>;
  /** 表示中の項目の出題を止めて、次のカードへ進む */
  suspendCurrent: () => Promise<void>;
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
  const [item, pack] = await Promise.all([db.items.get(card.itemKey), db.packs.get(card.packId)]);
  return item ? { card, item, lang: speechLang(pack?.language?.target) } : null;
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
    // 学習を終えたらアイコンの数字も更新する（アプリを閉じても古い数字が残らないように）
    void refreshAppBadge();
    useAiFocus.getState().setStudyCard(null, false);
  };

  return {
    status: 'idle',
    mode: 'srs',
    practiceKind: null,
    queue: [],
    current: null,
    revealed: false,
    shownAt: 0,
    planned: { new: 0, review: 0, learning: 0 },
    stats: emptyStats(),
    undoStack: [],
    lastRating: null,

    async start() {
      set({
        status: 'loading',
        mode: 'srs',
        practiceKind: null,
        stats: emptyStats(),
        undoStack: [],
        lastRating: null,
      });
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

    async startPractice(kind) {
      set({
        status: 'loading',
        mode: 'practice',
        practiceKind: kind,
        stats: emptyStats(),
        undoStack: [],
        lastRating: null,
      });
      try {
        const cards = await loadPracticeCards(useSettings.getState(), kind);
        set({ planned: { new: 0, review: cards.length, learning: 0 } });
        await showNext(cards);
      } catch (e) {
        console.error(e);
        toast.error('おさらいを始められませんでした', { description: errorMessage(e) });
        set({ status: 'idle', mode: 'srs' });
      }
    },

    reveal() {
      if (!get().current || get().revealed) return;
      set({ revealed: true });
      useAiFocus.getState().setStudyCard(get().current!.card.id, true);
    },

    async rate(grade) {
      const { current, queue, shownAt, stats, mode } = get();
      if (!current) return;
      const now = Date.now();
      const settings = useSettings.getState();
      const nextStats = (correctStreak: number): SessionStats => ({
        ...stats,
        done: stats.done + 1,
        ratings: { ...stats.ratings, [grade]: stats.ratings[grade] + 1 },
        correctStreak,
        bestStreak: Math.max(stats.bestStreak, correctStreak),
      });
      const reaction = (correctStreak: number) =>
        reactionText(getPersona(settings.persona, settings.customPersona), grade, correctStreak);
      if (mode === 'practice') {
        // おさらいは記録しない。思い出せなかったカードは少しあとにもう一度出す
        const rest = queue.slice(1);
        const gap = PRACTICE_REQUEUE[grade];
        if (gap !== undefined) rest.splice(Math.min(gap, rest.length), 0, current.card);
        const correctStreak = grade >= 3 ? stats.correctStreak + 1 : 0;
        set({
          stats: nextStats(correctStreak),
          lastRating: {
            grade,
            cardId: current.card.id,
            nextDue: current.card.due,
            at: now,
            reaction: reaction(correctStreak),
            done: stats.done + 1,
            correctStreak,
          },
        });
        await showNext(rest);
        return;
      }
      try {
        const { card, reviewId } = await saveRating(
          current.card,
          grade,
          now - shownAt,
          settings,
          now,
        );
        const rest = queue.slice(1);
        const pos = requeuePosition(rest, card, now, LEARN_AHEAD_MS);
        if (pos >= 0) rest.splice(pos, 0, card);
        const correct = grade >= 3;
        const correctStreak = correct ? stats.correctStreak + 1 : 0;
        set({
          stats: nextStats(correctStreak),
          undoStack: [
            ...get().undoStack.slice(-19),
            { reviewId, before: current.card, requeued: pos >= 0, statsBefore: stats },
          ],
          lastRating: {
            grade,
            cardId: card.id,
            nextDue: card.due,
            at: now,
            reaction: reaction(correctStreak),
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

    async suspendCurrent() {
      const { current, queue } = get();
      if (!current) return;
      const key = current.card.itemKey;
      try {
        await setItemSuspended(key, true);
        await showNext(queue.filter((c) => c.itemKey !== key));
        toast('この項目を出題しないようにしました', {
          description: '「教材」の項目一覧から再開できます',
          action: {
            label: '元に戻す',
            onClick: () =>
              void (async () => {
                await setItemSuspended(key, false);
                const card = await db.cards.get(current.card.id);
                if (card) await showNext([card, ...(get().current ? get().queue : [])]);
              })(),
          },
        });
      } catch (e) {
        toast.error('出題を止められませんでした', { description: errorMessage(e) });
      }
    },

    end() {
      set({ status: 'idle', mode: 'srs', queue: [], current: null, revealed: false });
      useAiFocus.getState().setStudyCard(null, false);
    },
  };
});
