import { useId, useState } from 'react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { parseDayKey } from '@/lib/srs/day';
import { cn } from '@/lib/utils/cn';

export interface DayValue {
  day: string;
  value: number;
  /** ツールチップに添える補足 */
  note?: string;
}

interface BarChartProps {
  data: DayValue[];
  /** 値の単位（ツールチップと表） */
  unit: string;
  /** 表で見るときの見出し */
  tableLabel: string;
  /** 今日を強調する */
  today?: string;
}

const H = 120;

function dayLabel(day: string): string {
  return format(parseDayKey(day), 'M/d（E）', { locale: ja });
}

/** 日ごとの棒グラフ（1 系列）。棒ごとにホバー・フォーカスで値を表示し、表でも見られる */
export function BarChart({ data, unit, tableLabel, today }: BarChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const tableId = useId();
  const peak = Math.max(0, ...data.map((d) => d.value));
  // 高さの計算用（すべて 0 のときに 0 で割らない）
  const max = Math.max(1, peak);
  const n = data.length;
  const slot = 100 / n;
  const gap = Math.min(0.6, slot * 0.2);
  const h = hover !== null ? data[hover] : null;

  return (
    <div>
      <div className="relative" onPointerLeave={() => setHover(null)}>
        <svg
          viewBox={`0 0 100 ${H}`}
          preserveAspectRatio="none"
          className="h-32 w-full overflow-visible"
          role="img"
          aria-label={`${tableLabel}（最大 ${peak} ${unit}）`}
        >
          <line
            x1="0"
            x2="100"
            y1={H}
            y2={H}
            className="stroke-slate-300 dark:stroke-slate-700"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
          {data.map((d, i) => {
            const bh = d.value > 0 ? Math.max(2, (d.value / max) * (H - 4)) : 0;
            return (
              <g key={d.day}>
                {/* 当たり判定は棒より大きく（列全体） */}
                <rect
                  x={i * slot}
                  y={0}
                  width={slot}
                  height={H}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${dayLabel(d.day)} ${d.value} ${unit}`}
                  onPointerEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                  className="outline-none"
                />
                {bh > 0 && (
                  <rect
                    x={i * slot + gap / 2}
                    y={H - bh}
                    width={slot - gap}
                    height={bh}
                    rx={Math.min(1.2, (slot - gap) / 2)}
                    className={cn(
                      'pointer-events-none transition-opacity',
                      d.day === today
                        ? 'fill-accent-700 dark:fill-accent-300'
                        : 'fill-accent-500 dark:fill-accent-400',
                      hover !== null && hover !== i && 'opacity-50',
                    )}
                  />
                )}
              </g>
            );
          })}
        </svg>
        {h && hover !== null && (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-white px-2.5 py-1.5 text-xs whitespace-nowrap shadow-md ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
            style={{ left: `${Math.min(88, Math.max(12, (hover + 0.5) * slot))}%` }}
          >
            <div className="font-semibold tabular-nums">
              {h.value} {unit}
            </div>
            <div className="text-slate-500 dark:text-slate-400">
              {dayLabel(h.day)}
              {h.note ? ` · ${h.note}` : ''}
            </div>
          </div>
        )}
      </div>
      <div className="mt-1 flex justify-between text-[0.7rem] text-slate-500 tabular-nums dark:text-slate-400">
        <span>{format(parseDayKey(data[0].day), 'M/d')}</span>
        <span>最大 {peak}</span>
        <span>{format(parseDayKey(data[n - 1].day), 'M/d')}</span>
      </div>
      <details className="mt-1 text-xs">
        <summary className="cursor-pointer text-slate-500 dark:text-slate-400">表で見る</summary>
        <table id={tableId} className="mt-1 w-full text-left tabular-nums">
          <thead>
            <tr className="text-slate-500">
              <th className="py-0.5 font-normal">日付</th>
              <th className="py-0.5 text-right font-normal">{tableLabel}</th>
            </tr>
          </thead>
          <tbody>
            {data
              .filter((d) => d.value > 0)
              .map((d) => (
                <tr key={d.day} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="py-0.5">{dayLabel(d.day)}</td>
                  <td className="py-0.5 text-right">
                    {d.value} {unit}
                    {d.note ? `（${d.note}）` : ''}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
