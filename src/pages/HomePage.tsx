import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Clock,
  Flame,
  GraduationCap,
  Library,
  MessagesSquare,
  Play,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { Link } from 'wouter';
import { cn } from '@/lib/utils/cn';
import { PageBody, PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { greetingText, getPersona } from '@/features/ai/personas';
import { ModelStatusChip } from '@/features/engine/ModelStatusChip';
import { useEngine } from '@/features/engine/engineStore';
import { useLibrary } from '@/features/library/libraryStore';
import { SampleList } from '@/features/library/SampleList';
import { useSettings } from '@/features/settings/settingsStore';
import { useTodayOverview } from '@/features/study/useTodayOverview';
import { WeekStrip } from '@/features/calendar/WeekStrip';
import { ScopePicker } from '@/features/study/ScopePicker';

function ProgressRing({ value }: { value: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" className="size-20 -rotate-90" aria-hidden>
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        strokeWidth="8"
        className="stroke-slate-200 dark:stroke-slate-800"
      />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, value))}
        className="stroke-accent-500 transition-[stroke-dashoffset] duration-500"
      />
    </svg>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 [&_svg]:size-5">
        {icon}
      </div>
      <div className="leading-tight">
        <div className="font-bold tabular-nums">{value}</div>
        <div className="text-xs text-slate-500 dark:text-slate-400">{label}</div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { overview } = useTodayOverview();
  const personaId = useSettings((s) => s.persona);
  const custom = useSettings((s) => s.customPersona);
  const engineStatus = useEngine((s) => s.status);
  const packCount = useLibrary((s) => s.packs.length);
  const libraryLoaded = useLibrary((s) => s.loaded);
  const persona = getPersona(personaId, custom);

  useEffect(() => {
    void useLibrary.getState().refresh();
  }, []);

  const remaining = overview
    ? overview.plannedNew + overview.plannedReviews + overview.plannedLearning
    : 0;
  const done = overview?.reviewsDone ?? 0;
  // 表示のたびに言葉が変わらないよう、画面を開いたときの乱数と時刻で選ぶ
  const [{ seed, hour }] = useState(() => ({ seed: Math.random(), hour: new Date().getHours() }));
  const greeting = overview
    ? greetingText(persona, { hour, remaining, packCount: overview.packCount }, seed)
    : '';
  const noPacks = libraryLoaded && packCount === 0;

  return (
    <>
      <PageHeader title="ホーム" actions={<ModelStatusChip className="max-w-40 sm:max-w-56" />} />
      <PageBody>
        <div className="flex items-start gap-3">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            {persona.emoji}
          </div>
          <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm leading-relaxed whitespace-pre-line shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            {greeting || '…'}
          </div>
        </div>

        {noPacks ? (
          <Card className="space-y-3 p-4 sm:p-5">
            <div className="flex items-center gap-2">
              <Library className="size-5 text-accent-600" />
              <h2 className="font-semibold">まずは教材を追加しましょう</h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              サンプル教材を追加するとすぐに始められます。外部の AI
              に作ってもらった教材を取り込むこともできます（「教材」画面）。
            </p>
            <SampleList compact />
          </Card>
        ) : (
          <Card className="p-4 sm:p-5">
            <ScopePicker className="mb-4" />
            <div className="flex items-center gap-4">
              <div className="relative">
                <ProgressRing value={done + remaining > 0 ? done / (done + remaining) : 0} />
                <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                  <span className="text-lg font-bold tabular-nums">{done}</span>
                  <span className="text-[0.65rem] text-slate-500">/ {done + remaining}</span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm text-slate-500 dark:text-slate-400">今日の学習</div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span>
                    新規{' '}
                    <strong className="text-sky-700 tabular-nums dark:text-sky-300">
                      {overview?.plannedNew ?? '-'}
                    </strong>
                  </span>
                  <span>
                    復習{' '}
                    <strong className="text-emerald-700 tabular-nums dark:text-emerald-300">
                      {overview ? overview.plannedReviews + overview.plannedLearning : '-'}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
            <Link href="/study">
              <Button variant="primary" size="lg" className="mt-4 w-full" disabled={!overview}>
                <Play />
                {remaining > 0 ? '学習を始める' : '今日の分は完了！（確認する）'}
              </Button>
            </Link>
          </Card>
        )}

        <Card className="grid grid-cols-3 gap-2 p-4">
          <Stat icon={<Flame />} value={`${overview?.streak ?? 0}日`} label="連続" />
          <Stat
            icon={<Clock />}
            value={`${Math.round((overview?.studyMs ?? 0) / 60_000)}分`}
            label="今日の学習時間"
          />
          <Stat
            icon={<GraduationCap />}
            value={`${overview?.learnedTotal ?? 0}`}
            label="学習済みカード"
          />
        </Card>

        <Link href="/calendar" className="block">
          <Card className="p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-semibold">この 1 週間</span>
              <span className="inline-flex items-center gap-1 text-accent-700 dark:text-accent-300">
                カレンダー <ArrowRight className="size-4" />
              </span>
            </div>
            <WeekStrip />
          </Card>
        </Link>

        {engineStatus === 'ready' && (
          <div className="grid grid-cols-2 gap-3">
            {!noPacks && (
              <Link href="/quiz" className="block">
                <Card className="h-full p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <Wand2 className="size-6 text-accent-600" />
                  <div className="mt-2 font-semibold">AI 例文クイズ</div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    忘れかけた単語を新しい例文で
                  </p>
                </Card>
              </Link>
            )}
            <Link href="/practice" className={cn('block', noPacks && 'col-span-2')}>
              <Card className="h-full p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <MessagesSquare className="size-6 text-accent-600" />
                <div className="mt-2 font-semibold">会話練習</div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  場面を決めて AI とロールプレイ
                </p>
              </Card>
            </Link>
          </div>
        )}

        <Link href={engineStatus === 'ready' ? '/chat' : '/models'} className="block">
          <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-accent-500 to-violet-500 text-white">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                {engineStatus === 'ready' ? `${persona.name}と話す` : 'AI パートナーを呼ぶ'}
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {engineStatus === 'ready'
                  ? '学習の相談・解説・例文づくりなど'
                  : 'ブラウザ内で動くローカル AI（Gemma 4 など）を読み込みます'}
              </p>
            </div>
            <ArrowRight className="size-5 text-slate-400" />
          </Card>
        </Link>
      </PageBody>
    </>
  );
}
