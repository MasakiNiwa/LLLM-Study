/**
 * AI が使えるツール（関数呼び出し）。
 *
 * AI は判断の材料が必要なときにこれらを呼び、アプリ（プログラム）が DB を調べて結果を返す。
 * 学習記録の集計や検索はプログラムが正確に行い、AI はその結果をもとに話す。
 */
import { format } from 'date-fns';
import { db } from '@/lib/db/db';
import { CardState } from '@/lib/db/types';
import type { JsonValue, ToolCallInfo, ToolDeclaration } from '@/lib/llm/types';
import { itemAnswer, itemSearchText, itemTitle } from '@/lib/packs/itemText';
import { addDays } from '@/lib/srs/day';
import { retrievability } from '@/lib/srs/scheduler';
import { getTodayOverview } from '@/features/study/repository';
import type { Settings } from '@/features/settings/settingsStore';
import { cardForLlm } from './studyContext';

export const TOOL_DECLARATIONS: ToolDeclaration[] = [
  {
    name: 'get_study_status',
    description:
      '今日の学習状況（学習した枚数・残り枚数・評価の内訳・連続日数）と、教材ごとの進み具合を調べる',
  },
  {
    name: 'search_items',
    description:
      '教材の中から単語・フレーズ・問題を探し、内容と学習状況（復習回数・忘れた回数・次回予定）を返す',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '探す言葉（英語でも日本語でもよい）' },
        limit: { type: 'integer', description: '最大件数（既定 5）' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_weak_items',
    description: 'よく忘れる・思い出せる確率が低い苦手な項目を調べる',
    parameters: {
      type: 'object',
      properties: { limit: { type: 'integer', description: '最大件数（既定 5）' } },
    },
  },
  {
    name: 'get_review_history',
    description: '直近の日ごとの学習枚数と正答率を調べる',
    parameters: {
      type: 'object',
      properties: { days: { type: 'integer', description: '何日分か（既定 7、最大 60）' } },
    },
  },
];

function clampInt(v: JsonValue | undefined, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? Math.round(v) : Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}

async function getStudyStatus(settings: Settings): Promise<JsonValue> {
  const o = await getTodayOverview(settings);
  const packs = await db.packs.orderBy('order').toArray();
  const packStats = await Promise.all(
    packs.map(async (p) => {
      const learned = await db.cards
        .where('[packId+state]')
        .between([p.id, CardState.Learning], [p.id, CardState.Relearning])
        .count();
      const total = await db.cards.where('packId').equals(p.id).count();
      return { title: p.title, enabled: p.enabled, cards: total, learned };
    }),
  );
  return {
    today: o.day,
    studied_today: o.reviewsDone,
    new_learned_today: o.newDone,
    remaining_today: { new: o.plannedNew, review: o.plannedReviews + o.plannedLearning },
    ratings_today: {
      again: o.ratings[1],
      hard: o.ratings[2],
      good: o.ratings[3],
      easy: o.ratings[4],
    },
    streak_days: o.streak,
    learned_cards_total: o.learnedTotal,
    unlearned_cards_total: o.newTotal,
    packs: packStats,
  };
}

async function searchItems(args: Record<string, JsonValue>): Promise<JsonValue> {
  const query = String(args.query ?? '')
    .trim()
    .toLowerCase();
  if (!query) return { error: 'query を指定してください' };
  const limit = clampInt(args.limit, 5, 1, 10);
  const matches = await db.items
    .filter((i) => itemSearchText(i.item).includes(query))
    .limit(limit)
    .toArray();
  const results = [];
  for (const m of matches) {
    const cards = await db.cards.where('itemKey').equals(m.key).toArray();
    const card = cards.sort((a, b) => b.reps - a.reps)[0];
    results.push(
      card ? await cardForLlm(card, { revealed: true }) : { content: itemTitle(m.item) },
    );
  }
  return { query, count: results.length, results: results as JsonValue[] };
}

async function getWeakItems(args: Record<string, JsonValue>): Promise<JsonValue> {
  const limit = clampInt(args.limit, 5, 1, 10);
  const now = Date.now();
  const learned = await db.cards.where('state').anyOf(1, 2, 3).toArray();
  const scored = learned
    .map((c) => ({ c, r: retrievability(c, now) ?? 1 }))
    .sort((a, b) => b.c.lapses - a.c.lapses || a.r - b.r)
    .slice(0, limit);
  const items = [];
  for (const { c, r } of scored) {
    const item = await db.items.get(c.itemKey);
    if (!item) continue;
    items.push({
      title: itemTitle(item.item),
      answer: itemAnswer(item.item),
      lapses: c.lapses,
      reviews: c.reps,
      recall_probability_now: Math.round(r * 100) / 100,
      next_review: format(c.due, 'yyyy-MM-dd'),
    });
  }
  return items.length ? { items } : { items: [], note: 'まだ学習済みのカードがありません' };
}

async function getReviewHistory(
  args: Record<string, JsonValue>,
  settings: Settings,
): Promise<JsonValue> {
  const days = clampInt(args.days, 7, 1, 60);
  const today = (await getTodayOverview(settings)).day;
  const from = addDays(today, -(days - 1));
  const reviews = await db.reviews.where('day').between(from, today, true, true).toArray();
  const byDay = new Map<string, { cards: number; correct: number }>();
  for (const r of reviews) {
    const d = byDay.get(r.day) ?? { cards: 0, correct: 0 };
    d.cards++;
    if (r.rating >= 3) d.correct++;
    byDay.set(r.day, d);
  }
  return {
    days: Array.from({ length: days }, (_, i) => {
      const day = addDays(from, i);
      const d = byDay.get(day);
      return {
        day,
        cards: d?.cards ?? 0,
        correct_rate: d && d.cards ? Math.round((d.correct / d.cards) * 100) / 100 : null,
      };
    }),
  };
}

export async function executeTool(call: ToolCallInfo, settings: Settings): Promise<JsonValue> {
  switch (call.name) {
    case 'get_study_status':
      return getStudyStatus(settings);
    case 'search_items':
      return searchItems(call.arguments);
    case 'get_weak_items':
      return getWeakItems(call.arguments);
    case 'get_review_history':
      return getReviewHistory(call.arguments, settings);
    default:
      return { error: `ツール ${call.name} はありません` };
  }
}

export const TOOL_LABELS: Record<string, string> = {
  get_study_status: '学習状況を確認',
  search_items: '教材を検索',
  get_weak_items: '苦手な項目を確認',
  get_review_history: '学習履歴を確認',
};
