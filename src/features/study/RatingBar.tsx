import { useMemo } from 'react';
import type { CardRecord, GradeValue } from '@/lib/db/types';
import { formatInterval, previewCard } from '@/lib/srs/scheduler';
import { cn } from '@/lib/utils/cn';
import { getSchedulerOptions, useSettings } from '@/features/settings/settingsStore';

const GRADES: { grade: GradeValue; label: string; className: string }[] = [
  {
    grade: 1,
    label: 'もう一度',
    className:
      'bg-rose-50 text-rose-700 hover:bg-rose-100 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
  },
  {
    grade: 2,
    label: '難しい',
    className:
      'bg-amber-50 text-amber-800 hover:bg-amber-100 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
  },
  {
    grade: 3,
    label: '正解',
    className:
      'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  },
  {
    grade: 4,
    label: '簡単',
    className:
      'bg-sky-50 text-sky-800 hover:bg-sky-100 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900',
  },
];

interface RatingBarProps {
  card: CardRecord;
  /** 間隔の計算に使う時刻（カードを表示した時刻） */
  now: number;
  onRate: (grade: GradeValue) => void;
  /** アプリがすすめる評価（選択問題の正誤など） */
  recommended?: GradeValue;
  disabled?: boolean;
}

/** 4 段階の評価ボタン。次回の間隔（FSRS の計算結果）を添える */
export function RatingBar({ card, now, onRate, recommended, disabled }: RatingBarProps) {
  const settings = useSettings();
  const showIntervals = settings.showIntervals;
  const opts = getSchedulerOptions(settings);
  const optsKey = JSON.stringify(opts);
  // カードと設定が同じなら計算し直さない
  const preview = useMemo(() => {
    const p = previewCard(card, now, JSON.parse(optsKey));
    return Object.fromEntries(Object.entries(p).map(([g, due]) => [g, formatInterval(due - now)]));
  }, [card, now, optsKey]);

  return (
    <div className="grid grid-cols-4 gap-2">
      {GRADES.map(({ grade, label, className }) => (
        <button
          key={grade}
          type="button"
          disabled={disabled}
          onClick={() => onRate(grade)}
          aria-keyshortcuts={String(grade)}
          className={cn(
            'flex h-14 flex-col items-center justify-center rounded-xl border text-sm font-semibold transition-all active:scale-95 disabled:opacity-50',
            className,
            recommended === grade &&
              'ring-2 ring-accent-500 ring-offset-2 dark:ring-offset-slate-950',
          )}
        >
          <span>{label}</span>
          {showIntervals && (
            <span className="text-[0.7rem] font-normal opacity-75">{preview[grade]}</span>
          )}
        </button>
      ))}
    </div>
  );
}
