/**
 * 今日の出題キューを組み立てる（純粋関数。DB の読み書きは study/repository.ts）。
 *
 * - 学習中（分単位のステップ）のカードは予定時刻が来たものから
 * - 復習カードは今日が期限のもの。期限切れが長いもの（思い出せる確率が低いもの）から
 * - 新しいカードは 1 日の上限まで。復習の間に均等に混ぜる
 */
import type { CardRecord } from '@/lib/db/types';

export interface QueueInput {
  /** 学習中・再学習中で、予定時刻を過ぎた（または間もなく来る）カード */
  learning: CardRecord[];
  /** 今日が期限の復習カード */
  reviews: CardRecord[];
  /** 新しいカードの候補（出す順に並んでいること） */
  newCards: CardRecord[];
  /** 今日すでに学習した新しいカード数 / 復習数 */
  newDoneToday: number;
  reviewsDoneToday: number;
  newPerDay: number;
  maxReviewsPerDay: number;
}

export interface QueuePlan {
  queue: CardRecord[];
  newCount: number;
  reviewCount: number;
  learningCount: number;
}

export function buildQueue(input: QueueInput): QueuePlan {
  const learning = [...input.learning].sort((a, b) => a.due - b.due);
  const reviewQuota = Math.max(0, input.maxReviewsPerDay - input.reviewsDoneToday);
  const reviews = [...input.reviews].sort((a, b) => a.due - b.due).slice(0, reviewQuota);
  const newQuota = Math.max(0, input.newPerDay - input.newDoneToday);
  const newCards = input.newCards.slice(0, newQuota);

  // 新しいカードを復習の間に均等に挟む
  const mixed: CardRecord[] = [];
  if (newCards.length === 0) {
    mixed.push(...reviews);
  } else {
    const step = reviews.length / (newCards.length + 1);
    let ni = 0;
    reviews.forEach((card, i) => {
      while (ni < newCards.length && i >= Math.round(step * (ni + 1))) mixed.push(newCards[ni++]);
      mixed.push(card);
    });
    while (ni < newCards.length) mixed.push(newCards[ni++]);
  }

  return {
    queue: [...learning, ...mixed],
    newCount: newCards.length,
    reviewCount: reviews.length,
    learningCount: learning.length,
  };
}

/**
 * 評価後のカードを、同じセッションの中でもう一度出すべきなら差し込む位置を返す。
 * 予定時刻が learnAheadMs 以内なら、残りのキューの中で予定時刻の順になる位置に入れる。
 * 戻り値 -1: 今日のセッションでは出さない
 */
export function requeuePosition(
  queue: readonly CardRecord[],
  card: CardRecord,
  now: number,
  learnAheadMs: number,
): number {
  if (card.state !== 1 && card.state !== 3) return -1;
  if (card.due > now + learnAheadMs) return -1;
  // 直後に同じカードが続かないよう、少なくとも数枚あとに入れる
  const minGap = Math.min(queue.length, 3);
  for (let i = minGap; i < queue.length; i++) {
    const other = queue[i];
    if ((other.state === 1 || other.state === 3) && other.due > card.due) return i;
  }
  return Math.max(minGap, queue.length);
}
