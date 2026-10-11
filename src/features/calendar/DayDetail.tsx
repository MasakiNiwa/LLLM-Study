import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { Card } from '@/components/ui/Card';
import { db } from '@/lib/db/db';
import type { DayActivity } from '@/lib/data/stats';
import { itemAnswer, itemTitle } from '@/lib/packs/itemText';
import { parseDayKey, studyDayEnd, studyDayStart } from '@/lib/srs/day';
import { cn } from '@/lib/utils/cn';
import { useSettings } from '@/features/settings/settingsStore';

interface Row {
  key: string;
  title: string;
  answer: string;
  /** 評価の並び（1〜4） */
  ratings: number[];
}

const RATING_DOT = ['', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500'];

async function loadPast(day: string): Promise<Row[]> {
  const reviews = await db.reviews.where('day').equals(day).sortBy('review');
  const byItem = new Map<string, number[]>();
  for (const r of reviews) byItem.set(r.itemKey, [...(byItem.get(r.itemKey) ?? []), r.rating]);
  const items = await db.items.bulkGet([...byItem.keys()]);
  return items.flatMap((it, i) => {
    const key = [...byItem.keys()][i];
    return it
      ? [{ key, title: itemTitle(it.item), answer: itemAnswer(it.item), ratings: byItem.get(key)! }]
      : [];
  });
}

async function loadFuture(day: string, isToday: boolean, dayStart: number): Promise<Row[]> {
  const end = studyDayEnd(day, dayStart);
  const start = isToday ? 0 : studyDayStart(day, dayStart);
  const cards = await db.cards
    .where('due')
    .between(start, end, true, false)
    .filter((c) => c.state !== 0 && !c.suspended)
    .limit(200)
    .toArray();
  const keys = [...new Set(cards.map((c) => c.itemKey))];
  const items = await db.items.bulkGet(keys);
  return items.flatMap((it, i) =>
    it
      ? [{ key: keys[i], title: itemTitle(it.item), answer: itemAnswer(it.item), ratings: [] }]
      : [],
  );
}

interface DayDetailProps {
  day: string;
  today: string;
  activity?: DayActivity;
  forecast?: number;
}

/** 選んだ日の学習内容（過去）・復習予定（未来） */
export function DayDetail({ day, today, activity, forecast }: DayDetailProps) {
  const dayStart = useSettings((s) => s.dayStartHour);
  const [result, setResult] = useState<{ day: string; rows: Row[] } | null>(null);
  const rows = result?.day === day ? result.rows : null;
  const isFuture = day > today;
  const isToday = day === today;

  useEffect(() => {
    let cancelled = false;
    const p = isFuture ? loadFuture(day, false, dayStart) : loadPast(day);
    p.then((r) => !cancelled && setResult({ day, rows: r }));
    return () => {
      cancelled = true;
    };
  }, [day, isFuture, dayStart]);

  const title = format(parseDayKey(day), 'M月d日（E）', { locale: ja });
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h2 className="font-semibold">
            {title}
            {isToday && <span className="ml-1 text-sm font-normal text-accent-600">今日</span>}
          </h2>
          {isFuture ? (
            <span className="text-sm text-slate-500">復習予定 {forecast ?? 0} 枚</span>
          ) : (
            <span className="text-sm text-slate-500">
              {activity
                ? `${activity.reviews} 回 · 正解率 ${Math.round((activity.correct / activity.reviews) * 100)}% · 新規 ${activity.newCards} · ${Math.max(1, Math.round(activity.ms / 60_000))} 分`
                : '学習なし'}
              {isToday && forecast ? ` · 残りの復習 ${forecast} 枚` : ''}
            </span>
          )}
        </div>
      </div>
      {rows === null ? (
        <div className="flex justify-center py-6 text-slate-400">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-5 text-center text-sm text-slate-500">
          {isFuture ? 'この日の復習予定はありません' : 'この日の学習記録はありません'}
        </p>
      ) : (
        <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 px-4 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{r.title}</div>
                <div className="truncate text-xs text-slate-500">{r.answer}</div>
              </div>
              {r.ratings.length > 0 && (
                <div className="flex shrink-0 gap-1" aria-label="評価">
                  {r.ratings.map((g, i) => (
                    <span key={i} className={cn('size-2.5 rounded-full', RATING_DOT[g])} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
