/**
 * アプリの状態を構造化データ（JSON）にして AI に渡す。
 * AI はこれを見て「今日あと何枚」「このカードは苦手」などを把握する（数字を作らせない）。
 */
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { db } from '@/lib/db/db';
import { CardState, type CardRecord } from '@/lib/db/types';
import { itemForLlm } from '@/lib/packs/itemText';
import { ITEM_TYPE_LABELS, templateLabel } from '@/lib/packs/templates';
import { retrievability } from '@/lib/srs/scheduler';
import { getTodayOverview } from '@/features/study/repository';
import type { Settings } from '@/features/settings/settingsStore';

const STATE_LABELS = ['未学習', '学習中', '復習', '再学習'] as const;

function round(n: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

/** カード 1 枚の学習状況（AI 向け） */
/** AI に渡す本文の最大文字数 */
const PASSAGE_LIMIT = 1500;

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…（以下省略）` : text;
}

export async function cardForLlm(
  card: CardRecord,
  options: { revealed: boolean; now?: number },
): Promise<Record<string, unknown> | null> {
  const now = options.now ?? Date.now();
  const item = await db.items.get(card.itemKey);
  if (!item) return null;
  const pack = await db.packs.get(card.packId);
  const r = retrievability(card, now);
  return {
    pack: pack?.title,
    kind: ITEM_TYPE_LABELS[item.item.type],
    question_style: templateLabel(item.item.type, card.template),
    answer_shown: options.revealed,
    content: itemForLlm(item.item),
    // 長文読解などの本文（長すぎるとコンテキストを圧迫するので先頭だけ）
    ...(item.passage && {
      passage: {
        title: item.passage.title,
        text: truncate(item.passage.text, PASSAGE_LIMIT),
        translation: options.revealed
          ? item.passage.translation && truncate(item.passage.translation, PASSAGE_LIMIT)
          : undefined,
      },
    }),
    progress: {
      state: STATE_LABELS[card.state],
      reviews: card.reps,
      lapses: card.lapses,
      ...(card.state !== CardState.New
        ? {
            stability_days: round(card.stability, 1),
            recall_probability_now: r !== undefined ? round(r) : undefined,
            next_review: format(card.due, 'yyyy-MM-dd'),
          }
        : {}),
    },
  };
}

export interface AppStateOptions {
  page: string;
  focusCardId?: string | null;
  revealed?: boolean;
}

export async function buildAppState(
  settings: Settings,
  options: AppStateOptions,
  now = Date.now(),
): Promise<Record<string, unknown>> {
  const overview = await getTodayOverview(settings, now);
  const packs = await db.packs.orderBy('order').toArray();
  const state: Record<string, unknown> = {
    now: format(now, 'yyyy-MM-dd HH:mm (E)', { locale: ja }),
    page: options.page,
    today: {
      studied_cards: overview.reviewsDone,
      new_learned: overview.newDone,
      remaining: {
        new: overview.plannedNew,
        review: overview.plannedReviews + overview.plannedLearning,
      },
      ratings: {
        again: overview.ratings[1],
        hard: overview.ratings[2],
        good: overview.ratings[3],
        easy: overview.ratings[4],
      },
      study_minutes: round(overview.studyMs / 60_000, 1),
    },
    streak_days: overview.streak,
    packs: packs
      .slice(0, 8)
      .map((p) => ({ title: p.title, items: p.itemCount, enabled: p.enabled })),
  };
  if (options.focusCardId) {
    const card = await db.cards.get(options.focusCardId);
    if (card) {
      state.current_card = await cardForLlm(card, { revealed: options.revealed ?? true, now });
    }
  }
  return state;
}

/** ユーザーの発話の前に付ける文脈 */
export function formatAppState(state: Record<string, unknown>): string {
  return `<app_state>\n${JSON.stringify(state)}\n</app_state>`;
}
