/**
 * 1 週間のふりかえり。
 * 数字の集計と比較はアプリが行い（weeklySummary）、AI はその結果を受け取って言葉にするだけにする。
 */
import type { StatsData } from '@/lib/data/stats';

export interface WeekNumbers {
  /** 学習した日数 */
  days: number;
  reviews: number;
  /** 正解率（0〜100。学習していなければ null） */
  correctRate: number | null;
  minutes: number;
}

export interface WeeklySummary {
  thisWeek: WeekNumbers;
  lastWeek: WeekNumbers;
  /** 今後 7 日の復習予定（今日の期限切れを含む） */
  upcoming: number;
  states: StatsData['states'];
  /** いま思い出せる確率の平均（0〜100） */
  averageRecall: number | null;
}

function sumWeek(days: StatsData['history']): WeekNumbers {
  const reviews = days.reduce((s, d) => s + d.reviews, 0);
  const correct = days.reduce((s, d) => s + d.correct, 0);
  return {
    days: days.filter((d) => d.reviews > 0).length,
    reviews,
    correctRate: reviews ? Math.round((correct / reviews) * 100) : null,
    minutes: Math.round(days.reduce((s, d) => s + d.ms, 0) / 60_000),
  };
}

/** 記録（過去の日ごとの活動。古い順で、最後が今日）から、この 7 日と前の 7 日を比べる */
export function weeklySummary(stats: StatsData): WeeklySummary {
  const h = stats.history;
  return {
    thisWeek: sumWeek(h.slice(-7)),
    lastWeek: sumWeek(h.slice(-14, -7)),
    upcoming: stats.forecast.slice(0, 7).reduce((s, d) => s + d.count, 0),
    states: stats.states,
    averageRecall: stats.averageRecall === undefined ? null : Math.round(stats.averageRecall * 100),
  };
}

function diff(n: number, unit: string): string {
  if (n === 0) return '先週と同じ';
  return `先週より ${n > 0 ? '+' : ''}${n}${unit}`;
}

/** アプリが出すふりかえり（AI が無くても表示する短い文） */
export function summaryLines(s: WeeklySummary): string[] {
  const t = s.thisWeek;
  if (t.reviews === 0) {
    return [
      'この 7 日間はまだ学習していません。',
      s.upcoming > 0 ? `これから 7 日で ${s.upcoming} 枚の復習が予定されています。` : '',
    ].filter(Boolean);
  }
  return [
    `この 7 日間: ${t.days} 日・${t.reviews} 回（${diff(t.reviews - s.lastWeek.reviews, ' 回')}）・${t.minutes} 分`,
    t.correctRate !== null
      ? `正解率 ${t.correctRate}%${
          s.lastWeek.correctRate !== null
            ? `（${diff(t.correctRate - s.lastWeek.correctRate, ' ポイント')}）`
            : ''
        }`
      : '',
    `定着したカード ${s.states.mature} 枚・これから 7 日の復習予定 ${s.upcoming} 枚`,
  ].filter(Boolean);
}

/** AI に渡すふりかえりの依頼（数字は JSON で渡し、計算はさせない） */
export function reviewPrompt(
  s: WeeklySummary,
  weak: { title: string; lapses: number }[],
  scope: string,
): string {
  const data = {
    scope,
    this_week: s.thisWeek,
    last_week: s.lastWeek,
    upcoming_reviews_7days: s.upcoming,
    cards: {
      new: s.states.newCards,
      learning: s.states.learning,
      young: s.states.young,
      mature: s.states.mature,
    },
    average_recall_percent: s.averageRecall,
    weak_items: weak,
  };
  return [
    'ユーザーの 1 週間の学習記録です（アプリが集計した正確な数字）。',
    `<study_week>${JSON.stringify(data)}</study_week>`,
    'この記録をもとに、あなたの性格で 1 週間のふりかえりをしてください。',
    '- よかった点を 1 つ具体的にほめる（数字に触れてよい。数字を作ったり計算し直したりしない）',
    '- 苦手な項目があれば 1〜2 個に触れて、覚えるコツをひとこと',
    '- 来週の目標を 1 つ、無理のない具体的な形で提案する',
    '全体で 4〜6 文。見出しや箇条書きは使わない。',
  ].join('\n');
}
