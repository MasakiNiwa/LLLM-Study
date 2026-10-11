import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { addDays, parseDayKey } from '@/lib/srs/day';
import { YEAR_WEEKS, yearStart } from '@/lib/data/stats';
import { HEAT_CLASSES, heatLevel } from '@/features/calendar/useCalendarData';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function dayLabel(day: string): string {
  const d = parseDayKey(day);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAYS[d.getDay()]}）`;
}

/**
 * この 1 年の学習量のヒートマップ（列が週、行が曜日）。
 * スマホでは横にスクロールでき、最初は今日の側（右端）を表示する。
 */
export function YearHeatmap({ today, year }: { today: string; year: Record<string, number> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // 最初だけ今日の側（右端）までスクロールする（日を選んだときに戻されないように）
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, []);
  const start = yearStart(today);
  const weeks = useMemo(
    () =>
      Array.from({ length: YEAR_WEEKS }, (_, w) =>
        Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)),
      ),
    [start],
  );
  // 月が変わる週の上に「n月」を出す
  const monthLabels = weeks.map((week, i) => {
    const m = parseDayKey(week[0]).getMonth();
    return i > 0 && m !== parseDayKey(weeks[i - 1][0]).getMonth() ? `${m + 1}月` : '';
  });
  const studied = Object.keys(year).length;
  const total = Object.values(year).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-2">
      <div className="flex overflow-x-auto p-1" ref={scrollRef}>
        <div
          // スマホは 1 マス 12px で横スクロール、PC は幅いっぱいに 1 年ぶんを並べる
          className="grid w-max min-w-full shrink-0 gap-[2px] [--cell:0.75rem] md:[--cell:0.5rem]"
          style={{ gridTemplateColumns: `auto repeat(${YEAR_WEEKS}, minmax(var(--cell), 1fr))` }}
          role="group"
          aria-label={`この 1 年で ${studied} 日、合計 ${total} 回学習しました`}
        >
          <span />
          {monthLabels.map((m, i) => (
            <span
              key={i}
              className="h-4 w-0 text-[0.6rem] leading-4 whitespace-nowrap text-slate-500"
            >
              {m}
            </span>
          ))}
          {WEEKDAYS.map((w, d) => (
            <Row key={w} label={d % 2 === 1 ? w : ''}>
              {weeks.map((week) => {
                const day = week[d];
                if (day > today) return <span key={day} className="aspect-square w-full" />;
                const n = year[day] ?? 0;
                return (
                  <button
                    key={day}
                    type="button"
                    title={`${dayLabel(day)} ${n} 回`}
                    aria-label={`${dayLabel(day)} ${n} 回`}
                    onClick={() => setSelected(day === selected ? null : day)}
                    className={cn(
                      'aspect-square w-full rounded-[3px]',
                      HEAT_CLASSES[heatLevel(n)],
                      day === today && 'ring-1 ring-slate-500',
                      day === selected && 'ring-2 ring-accent-500',
                    )}
                  />
                );
              })}
            </Row>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {selected
            ? `${dayLabel(selected)}: ${year[selected] ?? 0} 回`
            : `学習した日 ${studied} 日・合計 ${total} 回`}
        </span>
        <span className="flex items-center gap-1">
          少ない
          {HEAT_CLASSES.map((c, i) => (
            <span key={i} className={`size-3 rounded-[3px] ${c}`} />
          ))}
          多い
        </span>
      </div>
    </div>
  );
}

/** grid の 1 行（曜日ラベル + 週の数だけのマス）。display: contents で親の grid に並べる */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="contents">
      <span className="flex items-center pr-1 text-[0.6rem] leading-none text-slate-500">
        {label}
      </span>
      {children}
    </div>
  );
}
