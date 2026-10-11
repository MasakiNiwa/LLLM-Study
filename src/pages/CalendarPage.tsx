import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PageBody, PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { addDays, formatDayKey } from '@/lib/srs/day';
import { DayDetail } from '@/features/calendar/DayDetail';
import { MonthCalendar } from '@/features/calendar/MonthCalendar';
import { HEAT_CLASSES, useCalendarData } from '@/features/calendar/useCalendarData';
import { useStudyToday } from '@/features/study/useStudyToday';
import { useTodayOverview } from '@/features/study/useTodayOverview';

/** 月の表示に必要な 6 週ぶんの学習日（日曜始まり） */
function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month - 1, 1);
  const start = formatDayKey(new Date(year, month - 1, 1 - first.getDay()));
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <div className="text-xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
    </div>
  );
}

export default function CalendarPage() {
  const today = useStudyToday();
  const [ty, tm] = today.split('-').map(Number);
  const [ym, setYm] = useState({ y: ty, m: tm });
  const [selected, setSelected] = useState(today);
  const { overview } = useTodayOverview();

  const days = useMemo(() => monthGrid(ym.y, ym.m), [ym]);
  const data = useCalendarData(days[0], days[days.length - 1]);

  const monthPrefix = `${ym.y}-${String(ym.m).padStart(2, '0')}`;
  const monthStats = useMemo(() => {
    let studyDays = 0;
    let reviews = 0;
    let ms = 0;
    for (const [day, a] of Object.entries(data?.activity ?? {})) {
      if (!day.startsWith(monthPrefix)) continue;
      studyDays++;
      reviews += a.reviews;
      ms += a.ms;
    }
    return { studyDays, reviews, minutes: Math.round(ms / 60_000) };
  }, [data, monthPrefix]);

  const move = (delta: number) => {
    const d = new Date(ym.y, ym.m - 1 + delta, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() + 1 });
  };

  return (
    <>
      <PageHeader title="カレンダー" />
      <PageBody>
        <Card className="grid grid-cols-4 gap-2 px-2 py-3">
          <Summary label="連続日数" value={`${overview?.streak ?? 0}`} />
          <Summary label="今月の学習日" value={`${monthStats.studyDays}`} />
          <Summary label="今月の回数" value={`${monthStats.reviews}`} />
          <Summary label="今月の時間(分)" value={`${monthStats.minutes}`} />
        </Card>

        <Card className="p-3 sm:p-4">
          <div className="mb-3 flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={() => move(-1)} aria-label="前の月">
              <ChevronLeft />
            </Button>
            <h2 className="flex-1 text-center text-lg font-semibold tabular-nums">
              {ym.y}年 {ym.m}月
            </h2>
            <Button size="icon" variant="ghost" onClick={() => move(1)} aria-label="次の月">
              <ChevronRight />
            </Button>
          </div>
          <MonthCalendar
            days={days}
            month={ym.m}
            today={today}
            selected={selected}
            data={data}
            onSelect={setSelected}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div className="flex items-center gap-1">
              少ない
              {HEAT_CLASSES.map((c, i) => (
                <span key={i} className={`size-3 rounded ${c}`} />
              ))}
              多い
            </div>
            <span>未来の日付の数字は復習予定の枚数</span>
            {(ym.y !== ty || ym.m !== tm) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setYm({ y: ty, m: tm });
                  setSelected(today);
                }}
              >
                今日へ
              </Button>
            )}
          </div>
        </Card>

        <DayDetail
          day={selected}
          today={today}
          activity={data?.activity[selected]}
          forecast={data?.forecast[selected]}
        />
      </PageBody>
    </>
  );
}
