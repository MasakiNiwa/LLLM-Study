import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { dataWorker } from '@/lib/data/client';
import type { StatsData } from '@/lib/data/stats';
import { Select } from '@/components/ui/Select';
import { useSettings } from '@/features/settings/settingsStore';
import { useLibrary } from '@/features/library/libraryStore';
import { BarChart } from './BarChart';
import { StateBar } from './StateBar';
import { YearHeatmap } from './YearHeatmap';
import { WeeklyReview } from './WeeklyReview';

const DAYS = 30;

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-3 text-center">
      <div className="text-xl font-bold tabular-nums sm:text-2xl">{value}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      {hint && <div className="mt-0.5 text-[0.65rem] text-slate-400">{hint}</div>}
    </Card>
  );
}

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="space-y-3 p-4">
      <div>
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {children}
    </Card>
  );
}

/** 記録（統計）。集計は Data Worker で行う */
export function StatsPanel({ today }: { today: string }) {
  const dayStart = useSettings((s) => s.dayStartHour);
  const packs = useLibrary((s) => s.packs);
  const [packId, setPackId] = useState('');
  const [data, setData] = useState<{ key: string; stats: StatsData } | null>(null);
  // 消された教材が選ばれたままにならないように
  const scope = packs.some((p) => p.id === packId) ? packId : '';
  const key = `${today}:${dayStart}:${scope}`;

  useEffect(() => {
    void useLibrary.getState().refresh();
  }, []);

  useEffect(() => {
    let cancelled = false;
    dataWorker()
      .stats(today, dayStart, DAYS, Date.now(), scope || undefined)
      .then(
        (stats) => !cancelled && setData({ key, stats }),
        (e) => console.warn('記録を集計できませんでした', e),
      );
    return () => {
      cancelled = true;
    };
  }, [today, dayStart, scope, key]);

  const stats = data?.key === key ? data.stats : null;
  const picker =
    packs.length > 1 ? (
      <Select
        value={scope}
        onChange={setPackId}
        aria-label="集計する教材"
        options={[
          { value: '', label: 'すべての教材' },
          ...packs.map((p) => ({ value: p.id, label: p.title })),
        ]}
      />
    ) : null;
  if (!stats) {
    return (
      <div className="space-y-4">
        {picker}
        <div className="flex justify-center py-10 text-slate-400">
          <Loader2 className="size-6 animate-spin" />
        </div>
      </div>
    );
  }

  const recentReviews = stats.history.reduce((s, d) => s + d.reviews, 0);
  const recentCorrect = stats.history.reduce((s, d) => s + d.correct, 0);
  const correctRate = recentReviews ? Math.round((recentCorrect / recentReviews) * 100) : null;

  return (
    <div className="space-y-4">
      {picker}
      <WeeklyReview
        key={key}
        stats={stats}
        packId={scope || undefined}
        scope={packs.find((p) => p.id === scope)?.title ?? 'すべての教材'}
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="学習した日" value={`${stats.studyDays}`} />
        <Tile
          label="総学習回数"
          value={`${stats.totalReviews}`}
          hint={`${Math.round(stats.totalMs / 60_000)} 分`}
        />
        <Tile label="正解率（30日）" value={correctRate === null ? '-' : `${correctRate}%`} />
        <Tile
          label="いま思い出せる確率"
          value={
            stats.averageRecall === undefined ? '-' : `${Math.round(stats.averageRecall * 100)}%`
          }
          hint="学習済みカードの平均（FSRS の推定）"
        />
      </div>

      <ChartCard
        title="カードの状態"
        description="復習の間隔が 21 日以上になったカードを「定着」としています"
      >
        <StateBar states={stats.states} />
      </ChartCard>

      <ChartCard
        title="これからの復習予定"
        description={`今日から ${DAYS} 日間。今日の分には期限切れを含みます`}
      >
        <BarChart
          data={stats.forecast.map((d) => ({ day: d.day, value: d.count }))}
          unit="枚"
          tableLabel="復習予定"
          today={today}
        />
      </ChartCard>

      <ChartCard title="この 1 年" description="色が濃いほどたくさん学習した日です">
        <YearHeatmap today={today} year={stats.year} />
      </ChartCard>

      <ChartCard title="学習した回数" description={`直近 ${DAYS} 日`}>
        <BarChart
          data={stats.history.map((d) => ({
            day: d.day,
            value: d.reviews,
            note: d.reviews ? `正解率 ${Math.round((d.correct / d.reviews) * 100)}%` : undefined,
          }))}
          unit="回"
          tableLabel="学習した回数"
          today={today}
        />
      </ChartCard>
    </div>
  );
}
