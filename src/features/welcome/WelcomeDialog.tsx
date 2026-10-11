import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Brain, CalendarCheck, Cpu, Sparkles, Wand2 } from 'lucide-react';
import { useLocation } from 'wouter';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { PersonaPicker } from '@/features/ai/PersonaPicker';
import { useLibrary } from '@/features/library/libraryStore';
import { SampleList } from '@/features/library/SampleList';
import { useSettings } from '@/features/settings/settingsStore';
import { useWelcome } from './welcomeStore';

const STEPS = ['ようこそ', 'AI の性格', '教材'] as const;

function Point({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300 [&_svg]:size-5">
        {icon}
      </div>
      <div className="min-w-0 text-sm">
        <div className="font-semibold">{title}</div>
        <p className="text-slate-600 dark:text-slate-400">{text}</p>
      </div>
    </li>
  );
}

/**
 * はじめての案内（3 ステップ: アプリの考え方 → AI の性格 → サンプル教材）。
 * 教材がまだ無い人に一度だけ自動で出す。教材がすでにある人（以前から使っている人）には出さない。
 */
export function WelcomeDialog() {
  const onboarded = useSettings((s) => s.onboarded);
  const persona = useSettings((s) => s.persona);
  const update = useSettings((s) => s.update);
  const loaded = useLibrary((s) => s.loaded);
  const packCount = useLibrary((s) => s.packs.length);
  const open = useWelcome((s) => s.open);
  const [step, setStep] = useState(0);
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!useLibrary.getState().loaded) void useLibrary.getState().refresh();
  }, []);

  // 教材がまだ無い人には自動で開く（途中で教材を追加しても閉じないよう、開いた状態を保つ）。
  // 以前から使っている人には出さない
  useEffect(() => {
    if (onboarded || !loaded || open) return;
    if (packCount === 0) useWelcome.setState({ open: true });
    else update({ onboarded: true });
  }, [onboarded, loaded, packCount, open, update]);

  const finish = (to?: string) => {
    update({ onboarded: true });
    useWelcome.setState({ open: false });
    setStep(0);
    if (to) navigate(to);
  };

  const last = step === STEPS.length - 1;

  return (
    <Dialog
      open={open}
      title={`はじめに（${step + 1}/${STEPS.length}）`}
      onClose={() => finish()}
      footer={
        <>
          {step > 0 && (
            <Button variant="ghost" onClick={() => setStep(step - 1)} className="mr-auto">
              <ArrowLeft />
              戻る
            </Button>
          )}
          {last ? (
            <Button variant="primary" onClick={() => finish(packCount > 0 ? '/study' : undefined)}>
              {packCount > 0 ? '学習を始める' : 'はじめる'}
              <ArrowRight />
            </Button>
          ) : (
            <Button variant="primary" onClick={() => setStep(step + 1)}>
              次へ
              <ArrowRight />
            </Button>
          )}
        </>
      }
    >
      <ol className="mb-4 flex gap-1.5" aria-label="ステップ">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? 'step' : undefined}
            className={cn(
              'h-1.5 flex-1 rounded-full',
              i <= step ? 'bg-accent-500' : 'bg-slate-200 dark:bg-slate-800',
            )}
          >
            <span className="sr-only">{s}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <div className="text-center">
            <img src="./favicon.svg" alt="" className="mx-auto size-14" />
            <h3 className="mt-2 text-lg font-bold">自分のペースで、AI と一緒に</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              ローカルLLM学習アプリへようこそ。
            </p>
          </div>
          <ul className="space-y-3">
            <Point
              icon={<CalendarCheck />}
              title="復習のタイミングはアプリが決めます"
              text="最新の間隔反復アルゴリズム（FSRS）が、忘れかけたころに出題します。毎日少しずつで大丈夫。"
            />
            <Point
              icon={<Cpu />}
              title="AI はブラウザの中で動きます"
              text="Gemma 4 などのモデルを端末で動かすので、学習内容が外に送られません。AI なしでも学習できます。"
            />
            <Point
              icon={<Brain />}
              title="AI は解説・例文・おしゃべり担当"
              text="出題や採点の判断はアプリが行い、AI は反応したり、一緒に悩んだり、深掘りしたりします。"
            />
            <Point
              icon={<Wand2 />}
              title="教材は高性能な AI に作ってもらえます"
              text="「教材」画面のプロンプトを ChatGPT や Claude などに渡すと、好きなテーマの教材が作れます。"
            />
          </ul>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            一緒に学ぶ AI パートナーの性格を選んでください。あとから設定で変えられます。
          </p>
          <PersonaPicker
            value={persona}
            onChange={(id) => update({ persona: id })}
            includeCustom={false}
          />
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            まずはサンプル教材を追加してみましょう（いくつでも）。自分の教材はあとから「教材」画面で取り込めます。
          </p>
          <SampleList compact />
          <button
            type="button"
            onClick={() => finish('/models')}
            className="flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-300 p-3 text-left text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800/50"
          >
            <Sparkles className="size-4 shrink-0 text-accent-600" />
            <span className="flex-1">
              先に AI モデルを読み込む（数 GB のダウンロード。あとでも OK）
            </span>
            <ArrowRight className="size-4 shrink-0" />
          </button>
        </div>
      )}
    </Dialog>
  );
}
