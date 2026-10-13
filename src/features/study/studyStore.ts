/**
 * 学習セッション（今日のキューを 1 枚ずつ出題し、評価を保存する）。
 *
 * 出題順と次回の予定はアルゴリズム（FSRS・キュー）が決め、
 * AI は評価への「ひとこと」や解説を上乗せするだけにする。
 */
import { toast } from 'sonner';
import { create } from 'zustand';
import { interactiveAnswerText, isInteractive } from '@/lib/packs/interactiveCheck';
import { onLibraryChange } from '@/lib/db/changes';
import { db } from '@/lib/db/db';
import type { CardRecord, GradeValue, ItemRecord } from '@/lib/db/types';
import { requeuePosition } from '@/lib/srs/queue';
import { checkAnswer, type AnswerCheck, type AnswerVerdict } from '@/lib/srs/answerCheck';
import { answersInTargetLanguage, expectedAnswer } from '@/lib/packs/itemText';
import { speechLang } from '@/lib/speech/lang';
import { errorMessage } from '@/lib/utils/format';
import { useAiFocus } from '@/features/ai/focusStore';
import { getPersona, reactionText, type RevealOutcome } from '@/features/ai/personas';
import { useSettings } from '@/features/settings/settingsStore';
import { setItemSuspended } from './cardActions';
import { refreshAppBadge } from './appBadge';
import {
  LEARN_AHEAD_MS,
  loadPracticeCards,
  loadQueue,
  saveRating,
  StaleCardError,
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
  /** ユーザーが書いた答え（AI のひとことで触れる） */
  userAnswer?: { text: string; verdict: AnswerVerdict | null };
}

/** 選択・並べ替え・時間切れなど、表示中のカードへの答え方（画面を移っても保つ） */
export interface CardResponse {
  /** どの表示に対する答えか */
  shownAt: number;
  /** 選択問題で選んだ番号 */
  choice?: number;
  /** 並べ替えの結果 */
  order?: { built: string[]; correct: boolean };
  /** テストモードで時間切れになった */
  timedOut?: boolean;
  /** 仕訳・複数選択・数値入力・○×・組み合わせ・表の穴埋めの答え合わせの結果 */
  result?: { correct: boolean; value: unknown };
}

/** 表示中のカードにユーザーが書いた答えと、答え合わせの結果 */
export interface WrittenAnswer {
  /** どの表示に対する答えか（同じカードの再表示と区別する） */
  shownAt: number;
  text: string;
  /** プログラムで答え合わせできたときの結果（できない種類なら null） */
  check: AnswerCheck | null;
  /** 判定（AI に判定してもらうと変わる） */
  verdict: AnswerVerdict | null;
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
  /** 答えを表示した時刻（問題ごとの経過時間を止める） */
  revealedAt: number | null;
  /** 学習全体の制限時間になって終えた */
  timeUp: boolean;
  /** 最初のキューの内訳（進捗表示用） */
  planned: { new: number; review: number; learning: number };
  stats: SessionStats;
  undoStack: UndoEntry[];
  lastRating: LastRating | null;
  /** 表示中のカードに書いた答え */
  answer: WrittenAnswer | null;
  /** 表示中のカードへの答え方（選択・並べ替え・時間切れ） */
  response: CardResponse | null;
  /** 学習を中断した（ほかの画面から戻っても、自分で始めるまで再開しない） */
  interrupted: boolean;
  start: () => Promise<void>;
  /** おさらいを始める（評価は記録せず、スケジュールも変えない） */
  startPractice: (kind: PracticeKind) => Promise<void>;
  reveal: () => void;
  /** 書いた答えで答え合わせして、答えを表示する */
  /** 穴埋めの空欄が 2 つ以上なら、空欄ごとの答えを配列で渡す */
  submitAnswer: (answer: string | string[]) => void;
  /** AI の判定などで、書いた答えの判定を変える（shownAt の表示のままのときだけ） */
  setAnswerVerdict: (verdict: AnswerVerdict, shownAt: number) => void;
  /** 選択問題で選ぶ（答えを表示する） */
  choose: (index: number) => void;
  /** 並べ替えの答え合わせをする（答えを表示する） */
  submitOrder: (result: { built: string[]; correct: boolean }) => void;
  /** 仕訳・複数選択などの答え合わせをする（答えを表示する） */
  submitResult: (result: { correct: boolean; value: unknown }) => void;
  /** テストモードの時間切れ（答えを表示する） */
  timeOut: () => void;
  rate: (grade: GradeValue) => Promise<void>;
  undo: () => Promise<void>;
  /** 表示中の項目の出題を止めて、次のカードへ進む */
  suspendCurrent: () => Promise<void>;
  end: () => void;
  /** 学習を中断して、学習画面を最初の状態に戻す（評価済みの記録は残る） */
  interrupt: () => void;
  /**
   * 教材が変わったとき（削除・更新・進捗のリセットなど）、その教材のカードを持つ学習を終える。
   * 学習画面に戻ると、新しい内容で始め直す。packIds が null ならどの教材でも終える。
   */
  invalidate: (packIds: string[] | null) => void;
}

/**
 * 答えを見たときの結果（アプリが判定する。ひとことの出し分けに使う）。
 * 選択・並べ替え・時間切れ・書いた答えの判定から決め、どれもなければ「自分で答え合わせ中」
 */
export function revealOutcome(
  st: Pick<StudyState, 'current' | 'response' | 'answer' | 'shownAt'>,
): RevealOutcome {
  const response = st.response?.shownAt === st.shownAt ? st.response : null;
  if (response?.timedOut) return 'timeout';
  const item = st.current?.item.item;
  if (response?.choice !== undefined && item?.type === 'choice') {
    return response.choice === item.answer ? 'correct' : 'wrong';
  }
  if (response?.order) return response.order.correct ? 'correct' : 'wrong';
  if (response?.result) return response.result.correct ? 'correct' : 'wrong';
  if (item && isInteractive(item)) return 'gaveup';
  const written = st.answer?.shownAt === st.shownAt ? st.answer : null;
  return written?.verdict ?? 'self';
}

/**
 * ユーザーが答えた内容（AI のひとこと・解説で触れる）。書いた答えのほか、
 * 仕訳・複数選択などカードの中で答えた内容も文字にして渡す（判定はアプリのもの）
 */
export function currentUserAnswer(
  st: Pick<StudyState, 'current' | 'response' | 'answer' | 'shownAt'>,
): { text: string; verdict: AnswerVerdict | null } | null {
  const written = st.answer?.shownAt === st.shownAt ? st.answer : null;
  if (written) return { text: written.text, verdict: written.verdict };
  const response = st.response?.shownAt === st.shownAt ? st.response : null;
  const item = st.current?.item.item;
  if (!item || !response) return null;
  if (response.result) {
    const text = interactiveAnswerText(item, response.result.value);
    return text ? { text, verdict: response.result.correct ? 'correct' : 'wrong' } : null;
  }
  if (response.choice !== undefined && item.type === 'choice') {
    return {
      text: interactiveAnswerText(item, response.choice),
      verdict: response.choice === item.answer ? 'correct' : 'wrong',
    };
  }
  if (response.order) {
    return {
      text: response.order.built.join(' '),
      verdict: response.order.correct ? 'correct' : 'wrong',
    };
  }
  return null;
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
  /**
   * 評価・取り消し・出題停止は DB への保存を伴うので、1 つずつ順に行う。
   * 連打やキーの連続入力で同じカードの評価が二重に保存されないよう、処理中の操作は無視する。
   */
  let busy = false;
  const exclusive =
    <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
    async (...args: A): Promise<void> => {
      if (busy) return;
      busy = true;
      try {
        await fn(...args);
      } finally {
        busy = false;
      }
    };

  /**
   * 学習の世代。始める・終える・中断するたびに増やし、待っているあいだに世代が変わった
   * 古い処理（評価の保存・キューの読み込みなど）が、新しい画面の状態を上書きしないようにする。
   */
  let session = 0;

  /** キューの先頭から、項目が見つかるカードを取り出して表示する */
  const showNext = async (queue: CardRecord[], gen = session) => {
    const rest = [...queue];
    while (rest.length > 0) {
      const next = await withItem(rest[0]);
      if (gen !== session) return;
      if (next) {
        set({
          queue: rest,
          current: next,
          revealed: false,
          shownAt: Date.now(),
          revealedAt: null,
          status: 'studying',
          answer: null,
          response: null,
        });
        useAiFocus.getState().setStudyCard(next.card.id, false);
        return;
      }
      rest.shift();
    }
    set({
      queue: [],
      current: null,
      revealed: false,
      status: 'done',
      answer: null,
      response: null,
    });
    // 学習を終えたらアイコンの数字も更新する（アプリを閉じても古い数字が残らないように）
    void refreshAppBadge();
    useAiFocus.getState().setStudyCard(null, false);
  };

  /** 評価したあと次のカードへ。学習全体の制限時間を過ぎていたら、そこで終える */
  const advance = async (rest: CardRecord[], gen: number) => {
    const limit = useSettings.getState().sessionTimeLimit;
    if (limit > 0 && rest.length > 0 && Date.now() - get().stats.startedAt >= limit * 60_000) {
      await showNext([], gen);
      if (gen === session) set({ timeUp: true });
      return;
    }
    await showNext(rest, gen);
  };

  return {
    status: 'idle',
    mode: 'srs',
    practiceKind: null,
    queue: [],
    current: null,
    revealed: false,
    shownAt: 0,
    revealedAt: null,
    timeUp: false,
    planned: { new: 0, review: 0, learning: 0 },
    stats: emptyStats(),
    undoStack: [],
    lastRating: null,
    answer: null,
    response: null,
    interrupted: false,

    async start() {
      const gen = ++session;
      set({
        status: 'loading',
        interrupted: false,
        timeUp: false,
        mode: 'srs',
        practiceKind: null,
        stats: emptyStats(),
        undoStack: [],
        lastRating: null,
      });
      try {
        const plan = await loadQueue(useSettings.getState());
        if (gen !== session) return;
        set({
          planned: { new: plan.newCount, review: plan.reviewCount, learning: plan.learningCount },
        });
        await showNext(plan.queue, gen);
      } catch (e) {
        console.error(e);
        toast.error('学習を始められませんでした', { description: errorMessage(e) });
        if (gen === session) set({ status: 'idle' });
      }
    },

    async startPractice(kind) {
      const gen = ++session;
      set({
        status: 'loading',
        interrupted: false,
        timeUp: false,
        mode: 'practice',
        practiceKind: kind,
        stats: emptyStats(),
        undoStack: [],
        lastRating: null,
      });
      try {
        const cards = await loadPracticeCards(useSettings.getState(), kind);
        if (gen !== session) return;
        set({ planned: { new: 0, review: cards.length, learning: 0 } });
        await showNext(cards, gen);
      } catch (e) {
        console.error(e);
        toast.error('おさらいを始められませんでした', { description: errorMessage(e) });
        if (gen === session) set({ status: 'idle', mode: 'srs' });
      }
    },

    reveal() {
      if (!get().current || get().revealed) return;
      set({ revealed: true, revealedAt: Date.now() });
      useAiFocus.getState().setStudyCard(get().current!.card.id, true);
    },

    submitAnswer(input) {
      const { current, revealed, shownAt } = get();
      if (!current || revealed) return;
      const expected = expectedAnswer(current.item.item, current.card.template);
      const check = expected ? checkAnswer(input, expected) : null;
      const text = Array.isArray(input) ? input.map((p) => p.trim()).join(' / ') : input;
      // 一問一答や意味を答えるカードは言い換えが多く、完全一致しなければ「不正解」とは言い切れない。
      // そのときは判定を出さず、正解と見比べてもらう（AI があれば AI に判定してもらえる）
      const free =
        current.item.item.type === 'qa' ||
        !answersInTargetLanguage(current.item.item, current.card.template);
      const verdict = check && !(free && check.verdict === 'wrong') ? check.verdict : null;
      set({ answer: { shownAt, text, check, verdict } });
      get().reveal();
    },

    setAnswerVerdict(verdict, shownAt) {
      // AI の判定が遅れて返ってきたとき、次のカードの答えを書き換えないようにする
      const { answer } = get();
      if (answer && answer.shownAt === shownAt && get().shownAt === shownAt) {
        set({ answer: { ...answer, verdict } });
      }
    },

    choose(index) {
      const { current, revealed, shownAt } = get();
      if (!current || revealed) return;
      set({ response: { shownAt, choice: index } });
      get().reveal();
    },

    submitOrder(result) {
      const { current, revealed, shownAt } = get();
      if (!current || revealed) return;
      set({ response: { shownAt, order: result } });
      get().reveal();
    },

    submitResult(result) {
      const { current, revealed, shownAt } = get();
      if (!current || revealed) return;
      set({ response: { shownAt, result } });
      get().reveal();
    },

    timeOut() {
      const { current, revealed, shownAt } = get();
      if (!current || revealed) return;
      set({ response: { shownAt, timedOut: true } });
      get().reveal();
    },

    rate: exclusive(async (grade: GradeValue) => {
      const { current, queue, shownAt, stats, mode } = get();
      if (!current) return;
      const gen = session;
      const now = Date.now();
      const settings = useSettings.getState();
      const writtenAnswer = () => currentUserAnswer(get()) ?? undefined;
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
            userAnswer: writtenAnswer(),
          },
        });
        await advance(rest, gen);
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
        // 保存を待つあいだに中断・教材の変更などがあれば、記録は残して画面はそのまま
        if (gen !== session) return;
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
            userAnswer: writtenAnswer(),
          },
        });
        await advance(rest, gen);
      } catch (e) {
        if (e instanceof StaleCardError) {
          // 教材が削除・変更されていた: 古いカードでは続けず、学習を終える（戻ると始め直す）
          toast.info(e.message);
          if (gen === session) get().end();
          return;
        }
        console.error(e);
        toast.error('評価を保存できませんでした', { description: errorMessage(e) });
      }
    }),

    undo: exclusive(async () => {
      const stack = [...get().undoStack];
      const entry = stack.pop();
      if (!entry) return;
      const gen = session;
      try {
        const restored = await undoRating(entry.reviewId);
        if (!restored || gen !== session) return;
        let rest = get().current ? [...get().queue] : [];
        if (entry.requeued) rest = rest.filter((c) => c.id !== entry.before.id);
        set({ undoStack: stack, stats: entry.statsBefore, lastRating: null, timeUp: false });
        await showNext([restored, ...rest], gen);
        toast('直前の評価を取り消しました');
      } catch (e) {
        toast.error('取り消せませんでした', { description: errorMessage(e) });
      }
    }),

    suspendCurrent: exclusive(async () => {
      const { current, queue } = get();
      if (!current) return;
      const key = current.card.itemKey;
      const gen = session;
      try {
        await setItemSuspended(key, true, { notify: false });
        await showNext(
          queue.filter((c) => c.itemKey !== key),
          gen,
        );
        toast('この項目を出題しないようにしました', {
          description: '「教材」の項目一覧から再開できます',
          action: {
            label: '元に戻す',
            onClick: () =>
              void (async () => {
                await setItemSuspended(key, false, { notify: false });
                const card = await db.cards.get(current.card.id);
                if (card) await showNext([card, ...(get().current ? get().queue : [])]);
              })(),
          },
        });
      } catch (e) {
        toast.error('出題を止められませんでした', { description: errorMessage(e) });
      }
    }),

    // 学習画面を離れて戻ってきても、自分で始めるまで再開しない
    interrupt() {
      get().end();
      set({ interrupted: true });
    },

    invalidate(packIds) {
      const st = get();
      if (st.status === 'idle') return;
      const ids = packIds && new Set(packIds);
      const touches =
        !ids ||
        (st.current && ids.has(st.current.card.packId)) ||
        st.queue.some((c) => ids.has(c.packId)) ||
        st.undoStack.some((u) => ids.has(u.before.packId)) ||
        // 読み込み中は、どの教材のカードを読んでいるか分からないので始め直す
        st.status === 'loading';
      if (touches) get().end();
    },

    end() {
      session++;
      set({
        status: 'idle',
        mode: 'srs',
        queue: [],
        current: null,
        revealed: false,
        answer: null,
        response: null,
        interrupted: false,
      });
      useAiFocus.getState().setStudyCard(null, false);
    },
  };
});

// 教材の削除・更新・進捗のリセットなどを知らせてもらい、古いカードで学習を続けないようにする
onLibraryChange((packIds) => useStudy.getState().invalidate(packIds));
