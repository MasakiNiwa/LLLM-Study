/**
 * 学習データの読み書き（今日の状況・出題キュー・評価の保存・取り消し）。
 * スケジュールの計算は lib/srs、出題順の組み立ては lib/srs/queue.ts の純粋関数に任せる。
 */
import { db } from '@/lib/db/db';
import { CardState, type CardRecord, type GradeValue, type ReviewRecord } from '@/lib/db/types';
import { addDays, computeStreak, studyDayEnd, studyDayKey } from '@/lib/srs/day';
import { buildQueue, type QueuePlan } from '@/lib/srs/queue';
import { pickFsrsFields, rateCard } from '@/lib/srs/scheduler';
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

async function enabledPackIds(): Promise<Set<string>> {
  const packs = await db.packs.toArray();
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
  const enabled = await enabledPackIds();
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
  const done = await todayReviews(day);
  return buildQueue({
    learning,
    reviews,
    newCards: await newCandidates(enabled, settings, day),
    newDoneToday: new Set(done.filter((r) => r.state === CardState.New).map((r) => r.cardId)).size,
    reviewsDoneToday: done.filter((r) => r.state === CardState.Review).length,
    newPerDay: settings.newPerDay,
    maxReviewsPerDay: settings.maxReviewsPerDay,
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

/** 評価を保存する（カードの更新と記録の追加を 1 つのトランザクションで） */
export async function saveRating(
  card: CardRecord,
  grade: GradeValue,
  durationMs: number,
  settings: Settings,
  now = Date.now(),
): Promise<RatedCard> {
  const day = studyDayKey(now, settings.dayStartHour);
  const { fields } = rateCard(card, grade, now, getSchedulerOptions(settings));
  const next: CardRecord = {
    ...card,
    ...fields,
    introducedDay: card.introducedDay ?? day,
  };
  const review: ReviewRecord = {
    cardId: card.id,
    packId: card.packId,
    itemKey: card.itemKey,
    rating: grade,
    state: card.state,
    review: now,
    day,
    // 放置していた時間まで数えないよう上限を設ける
    durationMs: Math.min(durationMs, 5 * 60_000),
    nextDue: next.due,
    scheduled_days: next.scheduled_days,
    elapsed_days: card.last_review ? (now - card.last_review) / 86_400_000 : 0,
    stability: next.stability,
    difficulty: next.difficulty,
    prev: { ...pickFsrsFields(card), introducedDay: card.introducedDay },
  };
  const reviewId = await db.transaction('rw', [db.cards, db.reviews], async () => {
    await db.cards.put(next);
    return (await db.reviews.add(review)) as number;
  });
  return { card: next, reviewId };
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

/** 今日を含む直近 days 日の学習日の一覧（新しい順） */
export function recentDays(today: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(today, -i));
}
