import { useEffect, useState } from 'react';
import { Dumbbell, RotateCcw, Shuffle, Target } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useSettings } from '@/features/settings/settingsStore';
import {
  getPracticeCounts,
  PRACTICE_LIMIT,
  type PracticeCounts,
  type PracticeKind,
} from './repository';
import { useStudy } from './studyStore';

const OPTIONS: {
  kind: PracticeKind;
  label: string;
  note: (c: PracticeCounts) => string;
  icon: React.ReactNode;
  enabled: (c: PracticeCounts) => boolean;
}[] = [
  {
    kind: 'mistakes',
    label: '今日間違えたカード',
    note: (c) => (c.mistakes ? `${c.mistakes} 枚` : 'ありません'),
    icon: <RotateCcw />,
    enabled: (c) => c.mistakes > 0,
  },
  {
    kind: 'weak',
    label: '苦手なカード',
    note: (c) => `忘れていそうな順に最大 ${Math.min(PRACTICE_LIMIT, c.learned)} 枚`,
    icon: <Target />,
    enabled: (c) => c.learned > 0,
  },
  {
    kind: 'random',
    label: 'ランダムに',
    note: (c) => `学習済みから最大 ${Math.min(PRACTICE_LIMIT, c.learned)} 枚`,
    icon: <Shuffle />,
    enabled: (c) => c.learned > 0,
  },
];

/**
 * おさらい（記録を残さない練習）の選択肢。
 * 試験前や、間違えたところをもう一度確かめたいときに。スケジュールは変わらない。
 */
export function PracticePicker({
  className,
  onStart,
  stacked,
}: {
  className?: string;
  /** 幅の狭い場所では縦に並べる */
  stacked?: boolean;
  /** おさらいを始めたあとの処理（学習画面へ移動するなど） */
  onStart?: () => void;
}) {
  const [counts, setCounts] = useState<PracticeCounts | null>(null);
  const focus = useSettings((s) => s.focusPackId);
  const dayStart = useSettings((s) => s.dayStartHour);

  useEffect(() => {
    let cancelled = false;
    void getPracticeCounts(useSettings.getState()).then((c) => !cancelled && setCounts(c));
    return () => {
      cancelled = true;
    };
  }, [focus, dayStart]);

  if (!counts || counts.learned === 0) return null;
  return (
    <div className={cn('w-full space-y-2 text-left', className)}>
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Dumbbell className="size-4 text-accent-600" />
        おさらい
        <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
          記録に残らず、復習の予定も変わりません
        </span>
      </div>
      <div className={cn('grid gap-2', !stacked && 'sm:grid-cols-3')}>
        {OPTIONS.map((o) => {
          const enabled = o.enabled(counts);
          return (
            <button
              key={o.kind}
              type="button"
              disabled={!enabled}
              onClick={() => {
                void useStudy.getState().startPractice(o.kind);
                onStart?.();
              }}
              className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:hover:bg-white dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800/60 dark:disabled:hover:bg-slate-900 [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-accent-600"
            >
              {o.icon}
              <span className="min-w-0">
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">
                  {o.note(counts)}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
