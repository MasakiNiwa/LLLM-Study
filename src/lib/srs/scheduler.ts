/**
 * FSRS（Free Spaced Repetition Scheduler）による復習間隔の計算。
 * アルゴリズム本体は ts-fsrs（FSRS-6）を使い、ここではアプリのデータ形式との変換だけを行う。
 *
 * 方針: 「いつ復習するか」は LLM ではなくこのアルゴリズムが決める。
 *       LLM はその結果（安定度・想起率など）を見て声をかけたり解説したりする。
 */
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  type Card,
  type FSRS,
  type Grade as FsrsGrade,
  type ReviewLog,
} from 'ts-fsrs';
import type { CardStateValue, FsrsFields, GradeValue } from '@/lib/db/types';

export interface SchedulerOptions {
  /** 目標の記憶保持率（0.7〜0.97）。高いほど復習が増える */
  retention: number;
  /** 最大間隔（日） */
  maxIntervalDays: number;
  /** 同じ日に覚えたカードの予定を少しずつずらす */
  fuzz: boolean;
  /** 覚えたてのカードを分単位のステップで当日中に復習する */
  shortTerm: boolean;
}

export const DEFAULT_SCHEDULER_OPTIONS: SchedulerOptions = {
  retention: 0.9,
  maxIntervalDays: 36500,
  fuzz: true,
  shortTerm: true,
};

let cached: { key: string; f: FSRS } | null = null;

export function getScheduler(opts: SchedulerOptions): FSRS {
  const key = JSON.stringify(opts);
  if (cached?.key !== key) {
    cached = {
      key,
      f: fsrs(
        generatorParameters({
          request_retention: opts.retention,
          maximum_interval: opts.maxIntervalDays,
          enable_fuzz: opts.fuzz,
          enable_short_term: opts.shortTerm,
        }),
      ),
    };
  }
  return cached.f;
}

export function newFsrsFields(now: number): FsrsFields {
  return fromFsrsCard(createEmptyCard(new Date(now)));
}

export function toFsrsCard(f: FsrsFields): Card {
  return {
    due: new Date(f.due),
    stability: f.stability,
    difficulty: f.difficulty,
    elapsed_days: f.elapsed_days,
    scheduled_days: f.scheduled_days,
    learning_steps: f.learning_steps,
    reps: f.reps,
    lapses: f.lapses,
    state: f.state,
    last_review: f.last_review !== undefined ? new Date(f.last_review) : undefined,
  };
}

export function fromFsrsCard(c: Card): FsrsFields {
  return {
    due: c.due.getTime(),
    stability: c.stability,
    difficulty: c.difficulty,
    elapsed_days: c.elapsed_days,
    scheduled_days: c.scheduled_days,
    learning_steps: c.learning_steps,
    reps: c.reps,
    lapses: c.lapses,
    state: c.state as CardStateValue,
    last_review: c.last_review ? c.last_review.getTime() : undefined,
  };
}

export function pickFsrsFields<T extends FsrsFields>(r: T): FsrsFields {
  return {
    due: r.due,
    stability: r.stability,
    difficulty: r.difficulty,
    elapsed_days: r.elapsed_days,
    scheduled_days: r.scheduled_days,
    learning_steps: r.learning_steps,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state,
    last_review: r.last_review,
  };
}

export interface RateResult {
  fields: FsrsFields;
  log: ReviewLog;
}

/** 評価を適用した次の状態 */
export function rateCard(
  card: FsrsFields,
  grade: GradeValue,
  now: number,
  opts: SchedulerOptions,
): RateResult {
  const r = getScheduler(opts).next(toFsrsCard(card), new Date(now), grade as FsrsGrade);
  return { fields: fromFsrsCard(r.card), log: r.log };
}

/** 4 つの評価それぞれの次回予定（ボタンに表示する） */
export function previewCard(
  card: FsrsFields,
  now: number,
  opts: SchedulerOptions,
): Record<GradeValue, number> {
  const preview = getScheduler(opts).repeat(toFsrsCard(card), new Date(now));
  return {
    1: preview[1].card.due.getTime(),
    2: preview[2].card.due.getTime(),
    3: preview[3].card.due.getTime(),
    4: preview[4].card.due.getTime(),
  };
}

/** 現在思い出せる確率（0〜1）。未学習のカードは undefined */
export function retrievability(card: FsrsFields, now: number): number | undefined {
  if (card.state === 0) return undefined;
  const f = getScheduler(DEFAULT_SCHEDULER_OPTIONS);
  return f.get_retrievability(toFsrsCard(card), new Date(now), false);
}

/** 間隔を「10分」「3日」「2.5ヶ月」のような短い表記にする */
export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60_000));
  if (min < 60) return `${min}分`;
  const hours = ms / 3_600_000;
  if (hours < 24) return `${Math.round(hours)}時間`;
  const days = ms / 86_400_000;
  if (days < 30) return `${Math.round(days)}日`;
  if (days < 365) return `${(days / 30).toFixed(days < 300 ? 1 : 0).replace(/\.0$/, '')}ヶ月`;
  return `${(days / 365).toFixed(1).replace(/\.0$/, '')}年`;
}
