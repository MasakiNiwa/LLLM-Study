import { useEffect, useState } from 'react';
import { dataWorker } from '@/lib/data/client';
import type { CalendarData } from '@/lib/data/stats';
import { studyDayKey } from '@/lib/srs/day';
import { useSettings } from '@/features/settings/settingsStore';

/** from〜to の活動と復習予定（集計は Data Worker） */
export function useCalendarData(from: string, to: string, version = 0) {
  const dayStart = useSettings((s) => s.dayStartHour);
  const [data, setData] = useState<CalendarData | null>(null);
  useEffect(() => {
    let cancelled = false;
    const today = studyDayKey(Date.now(), dayStart);
    dataWorker()
      .calendar(from, to, today, dayStart)
      .then(
        (d) => !cancelled && setData(d),
        (e) => console.warn('カレンダーを集計できませんでした', e),
      );
    return () => {
      cancelled = true;
    };
  }, [from, to, dayStart, version]);
  return data;
}

/** 学習量に応じた色の濃さ（0〜4） */
export function heatLevel(reviews: number): 0 | 1 | 2 | 3 | 4 {
  if (reviews <= 0) return 0;
  if (reviews < 10) return 1;
  if (reviews < 30) return 2;
  if (reviews < 60) return 3;
  return 4;
}

export const HEAT_CLASSES = [
  'bg-slate-100 dark:bg-slate-800/60',
  'bg-accent-100 dark:bg-accent-900/40',
  'bg-accent-200 dark:bg-accent-800/60',
  'bg-accent-400 text-white dark:bg-accent-600',
  'bg-accent-600 text-white dark:bg-accent-500',
] as const;
