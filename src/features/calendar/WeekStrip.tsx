import { addDays, parseDayKey } from '@/lib/srs/day';
import { cn } from '@/lib/utils/cn';
import { useStudyToday } from '@/features/study/useStudyToday';
import { HEAT_CLASSES, heatLevel, useCalendarData } from './useCalendarData';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

/** 直近 7 日の学習量（ホーム画面用） */
export function WeekStrip() {
  const today = useStudyToday();
  const from = addDays(today, -6);
  const data = useCalendarData(from, today);
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: 7 }, (_, i) => {
        const day = addDays(from, i);
        const reviews = data?.activity[day]?.reviews ?? 0;
        return (
          <div key={day} className="flex flex-col items-center gap-1">
            <span className="text-[0.7rem] text-slate-500">
              {WEEKDAYS[parseDayKey(day).getDay()]}
            </span>
            <div
              className={cn(
                'flex aspect-square w-full max-w-10 items-center justify-center rounded-lg text-xs font-medium tabular-nums',
                HEAT_CLASSES[heatLevel(reviews)],
                day === today && 'ring-2 ring-accent-500 ring-offset-1 dark:ring-offset-slate-900',
              )}
              title={`${day}: ${reviews} 枚`}
            >
              {reviews > 0 ? reviews : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}
