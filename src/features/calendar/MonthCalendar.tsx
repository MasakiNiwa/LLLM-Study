import { cn } from '@/lib/utils/cn';
import type { CalendarData } from '@/lib/data/stats';
import { HEAT_CLASSES, heatLevel } from './useCalendarData';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

interface MonthCalendarProps {
  /** 表示する月のマス（前後の月を含む 6 週ぶんの学習日） */
  days: string[];
  month: number;
  today: string;
  selected: string;
  data: CalendarData | null;
  onSelect: (day: string) => void;
}

/** 月のカレンダー。過去は学習量の濃淡、未来は復習予定の枚数を表示する */
export function MonthCalendar({
  days,
  month,
  today,
  selected,
  data,
  onSelect,
}: MonthCalendarProps) {
  return (
    <div>
      <div className="mb-1 grid grid-cols-7 text-center text-xs text-slate-500">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={cn(i === 0 && 'text-rose-500', i === 6 && 'text-sky-600')}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {days.map((day) => {
          const [, m, d] = day.split('-').map(Number);
          const inMonth = m === month;
          const reviews = data?.activity[day]?.reviews ?? 0;
          const forecast = data?.forecast[day] ?? 0;
          const future = day > today;
          const level = future ? 0 : heatLevel(reviews);
          return (
            <button
              key={day}
              type="button"
              onClick={() => onSelect(day)}
              aria-pressed={selected === day}
              aria-label={`${day} ${future ? `復習予定 ${forecast} 枚` : `${reviews} 回学習`}`}
              className={cn(
                'relative flex aspect-square flex-col items-center justify-center rounded-xl text-sm transition-colors sm:aspect-[4/3]',
                future ? 'bg-white dark:bg-slate-900' : HEAT_CLASSES[level],
                !inMonth && 'opacity-35',
                selected === day && 'ring-2 ring-accent-600 dark:ring-accent-400',
                day === today && 'font-bold',
              )}
            >
              <span className={cn(day === today && 'rounded-full bg-accent-600 px-1.5 text-white')}>
                {d}
              </span>
              {future
                ? forecast > 0 && (
                    <span className="text-[0.65rem] font-medium text-slate-500 tabular-nums dark:text-slate-400">
                      {forecast}
                    </span>
                  )
                : reviews > 0 && (
                    <span className="text-[0.65rem] tabular-nums opacity-80">{reviews}</span>
                  )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
