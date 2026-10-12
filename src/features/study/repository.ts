/**
 * 学習データの読み書き（今日の状況・出題キュー・評価の保存・取り消し）。
 * スケジュールの計算は lib/srs、出題順の組み立ては lib/srs/queue.ts の純粋関数に任せる。
 */
import { db } from '@/lib/db/db';
import { CardState, type CardRecord, type GradeValue, type ReviewRecord } from '@/lib/db/types';
import { addDays, computeStreak, studyDayEnd, studyDayKey } from '@/lib/srs/day';
import { buildQueue, type QueuePlan } from '@/lib/srs/queue';
import { pickFsrsFields, rateCard, retrievability } from '@/lib/srs/scheduler';
import { getSchedulerOptions, type Settings } from '@/features/settings/settingsStore';

/** 学習中のカードを、予定時刻より少し早めに出してよい幅 */
export const LEARN_AHEAD_MS = 20 * 60_000;

export interface TodayOverview {
  day: string;
  /** 今日これから出す予定の数（上限込み） */
  plannedNew: number;
  plannedReviews: number;
  plannedLearning: number;
  /** 今日すでに学習した数 */
  newDone: number;
  reviewsDone: number;
  /** 今日の評価の内訳 */
  ratings: Record<GradeValue, number>;
  studyMs: number;
  /** 未学習のカードの総数 */
  newTotal: number;
  /** 学習済み（1 回以上）のカードの総数 */
  learnedTotal: number;
  streak: number;
  packCount: number;
}

/**
 * 学習の対象にする教材。教材を絞っていればその 1 つ（無効にしていても対象にする）、
 * そうでなければ有効なすべての教材。
 */
export async function studyPackIds(settings: Pick<Settings, 'focusPackId'>): Promise<Set<string>> {
  const packs = await db.packs.toArray();
  if (settings.focusPackId && packs.some((p) => p.id === settings.focusPackId)) {
    return new Set([settings.focusPackId]);
  }
  return new Set(packs.filter((p) => p.enabled).map((p) => p.id));
}

function isActive(enabled: Set<string>) {
  return (c: CardRecord) => c.suspended === 0 && enabled.has(c.packId);
}

/** 日付から決まる疑似乱数（同じ日ならランダムな順番が変わらない） */
function seededRandom(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

async function newCandidates(
  enabled: Set<string>,
  settings: Settings,
  day: string,
): Promise<CardRecord[]> {
  const packs = await db.packs.toArray();
  const packOrder = new Map(packs.map((p) => [p.id, p.order]));
  const cards = await db.cards
    .where('state')
    .equals(CardState.New)
    .filter(isActive(enabled))
    .toArray();
  // 同じ項目のカードは「意味を答える」→「単語を答える」の順（易しい方から）
  const templateRank = (t: string) => (t === 'recall' ? 1 : 0);
  if (settings.newCardOrder === 'random') {
    const rand = seededRandom(day);
    const keyed = cards.map((c) => [rand(), c] as const);
    keyed.sort((a, b) => templateRank(a[1].template) - templateRank(b[1].template) || a[0] - b[0]);
    return keyed.map(([, c]) => c);
  }
  return cards.sort(
    (a, b) =>
      (packOrder.get(a.packId) ?? 0) - (packOrder.get(b.packId) ?? 0) ||
      templateRank(a.template) - templateRank(b.template) ||
      a.order - b.order,
  );
}

async function todayReviews(day: string): Promise<ReviewRecord[]> {
  return db.reviews.where('day').equals(day).toArray();
}

export async function loadQueue(settings: Settings, now = Date.now()): Promise<QueuePlan> {
  const day = studyDayKey(now, settings.dayStartHour);
  const end = studyDayEnd(day, settings.dayStartHour);
  const enabled = await studyPackIds(settings);
  const active = isActive(enabled);
  const started = await db.cards
    .where('state')
    .anyOf(CardState.Learning, CardState.Review, CardState.Relearning)
    .filter(active)
    .toArray();
  const learning = started.filter(
    (c) => c.state !== CardState.Review && c.due <= now + LEARN_AHEAD_MS,
  );
  const reviews = started.filter((c) => c.state === CardState.Review && c.due < end);
  // 1 日の上限は、学習の対象にしている教材の中で数える（教材を切り替えたら、その教材の分を出せる）
  const done = (await todayReviews(day)).filter((r) => enabled.has(r.packId));
  const unlimited = settings.noDailyLimit;
  return buildQueue({
    learning,
    reviews,
    newCards: await newCandidates(enabled, settings, day),
    newDoneToday: new Set(done.filter((r) => r.state === CardState.New).map((r) => r.cardId)).size,
    reviewsDoneToday: done.filter((r) => r.state === CardState.Review).length,
    newPerDay: unlimited ? Infinity : settings.newPerDay,
    maxReviewsPerDay: unlimited ? Infinity : settings.maxReviewsPerDay,
  });
}

export async function getTodayOverview(
  settings: Settings,
  now = Date.now(),
): Promise<TodayOverview> {
  const day = studyDayKey(now, settings.dayStartHour);
  const [plan, done, days, newTotal, total, packCount] = await Promise.all([
    loadQueue(settings, now),
    todayReviews(day),
    db.reviews.orderBy('day').uniqueKeys(),
    db.cards.where('state').equals(CardState.New).count(),
    db.cards.count(),
    db.packs.count(),
  ]);
  const ratings: Record<GradeValue, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const r of done) ratings[r.rating]++;
  return {
    day,
    plannedNew: plan.newCount,
    plannedReviews: plan.reviewCount,
    plannedLearning: plan.learningCount,
    newDone: new Set(done.filter((r) => r.state === CardState.New).map((r) => r.cardId)).size,
    reviewsDone: done.length,
    ratings,
    studyMs: done.reduce((sum, r) => sum + r.durationMs, 0),
    newTotal,
    learnedTotal: total - newTotal,
    streak: computeStreak(new Set(days as string[]), day),
    packCount,
  };
}

export interface RatedCard {
  card: CardRecord;
  reviewId: number;
}

/** 評価しようとしたカード・項目・教材が、すでに削除されていた */
export class StaleCardError extends Error {
  constructor() {
    super('このカードの教材が削除・変更されたため、評価を保存しませんでした');
    this.name = 'StaleCardError';
  }
}

/**
 * 評価を保存する（カードの更新と記録の追加を 1 つのトランザクションで）。
 * 保存の直前に、カード・項目・教材がまだあるかを確かめ、最新のカードをもとに計算する
 * （画面に出していたあいだに教材が削除・リセットされても、古いカードで上書きしない）。
 */
export async function saveRating(
  card: CardRecord,
  grade: GradeValue,
  durationMs: number,
  settings: Settings,
  now = Date.now(),
): Promise<RatedCard> {
  const day = studyDayKey(now, settings.dayStartHour);
  return db.transaction('rw', [db.cards, db.reviews, db.items, db.packs], async () => {
    const [stored, item, pack] = await Promise.all([
      db.cards.get(card.id),
      db.items.get(card.itemKey),
      db.packs.get(card.packId),
    ]);
    if (!stored || !item || !pack) throw new StaleCardError();
    const { fields } = rateCard(stored, grade, now, getSchedulerOptions(settings));
    const next: CardRecord = {
      ...stored,
      ...fields,
      introducedDay: stored.introducedDay ?? day,
    };
    const review: ReviewRecord = {
      cardId: stored.id,
      packId: stored.packId,
      itemKey: stored.itemKey,
      rating: grade,
      state: stored.state,
      review: now,
      day,
      // 放置していた時間まで数えないよう上限を設ける
      durationMs: Math.min(durationMs, 5 * 60_000),
      nextDue: next.due,
      scheduled_days: next.scheduled_days,
      elapsed_days: stored.last_review ? (now - stored.last_review) / 86_400_000 : 0,
      stability: next.stability,
      difficulty: next.difficulty,
      prev: { ...pickFsrsFields(stored), introducedDay: stored.introducedDay },
    };
    await db.cards.put(next);
    const reviewId = (await db.reviews.add(review)) as number;
    return { card: next, reviewId };
  });
}

/** 直前の評価を取り消して、評価前のカードに戻す */
export async function undoRating(reviewId: number): Promise<CardRecord | undefined> {
  return db.transaction('rw', [db.cards, db.reviews], async () => {
    const review = await db.reviews.get(reviewId);
    if (!review) return undefined;
    const card = await db.cards.get(review.cardId);
    await db.reviews.delete(reviewId);
    if (!card) return undefined;
    const restored: CardRecord = { ...card, ...review.prev };
    await db.cards.put(restored);
    return restored;
  });
}

/**
 * おさらい（記録を残さない練習）で出すカードの選び方。
 * - mistakes: 今日「もう一度」「難しい」にしたカード
 * - weak: 学習済みのうち、いま思い出せる確率が低いカード（忘れた回数が多いほど優先）
 * - random: 学習済みのカードからランダム
 */
export type PracticeKind = 'mistakes' | 'weak' | 'random';

/** おさらいで一度に出すカードの数 */
export const PRACTICE_LIMIT = 20;

export interface PracticeCounts {
  mistakes: number;
  learned: number;
}

async function learnedInScope(settings: Settings): Promise<CardRecord[]> {
  const enabled = await studyPackIds(settings);
  return db.cards
    .where('state')
    .anyOf(CardState.Learning, CardState.Review, CardState.Relearning)
    .filter(isActive(enabled))
    .toArray();
}

async function mistakesToday(settings: Settings, now: number): Promise<CardRecord[]> {
  const day = studyDayKey(now, settings.dayStartHour);
  const enabled = await studyPackIds(settings);
  const ids = [
    ...new Set(
      (await todayReviews(day))
        .filter((r) => r.rating <= 2 && enabled.has(r.packId))
        .map((r) => r.cardId),
    ),
  ];
  const cards = await db.cards.bulkGet(ids);
  return cards.filter((c): c is CardRecord => !!c && c.suspended === 0);
}

/** おさらいの選択肢に添える数 */
export async function getPracticeCounts(
  settings: Settings,
  now = Date.now(),
): Promise<PracticeCounts> {
  const [mistakes, learned] = await Promise.all([
    mistakesToday(settings, now),
    learnedInScope(settings),
  ]);
  return { mistakes: mistakes.length, learned: learned.length };
}

/** おさらいで出すカード（スケジュールは変えない） */
export async function loadPracticeCards(
  settings: Settings,
  kind: PracticeKind,
  now = Date.now(),
  limit = PRACTICE_LIMIT,
): Promise<CardRecord[]> {
  if (kind === 'mistakes') return (await mistakesToday(settings, now)).slice(0, limit);
  const learned = await learnedInScope(settings);
  if (kind === 'weak') {
    const score = (c: CardRecord) => (retrievability(c, now) ?? 1) - 0.05 * c.lapses;
    return learned
      .map((c) => [score(c), c] as const)
      .sort((a, b) => a[0] - b[0])
      .slice(0, limit)
      .map(([, c]) => c);
  }
  const rand = seededRandom(String(now));
  return learned
    .map((c) => [rand(), c] as const)
    .sort((a, b) => a[0] - b[0])
    .slice(0, limit)
    .map(([, c]) => c);
}

/** 今日を含む直近 days 日の学習日の一覧（新しい順） */
export function recentDays(today: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(today, -i));
}
