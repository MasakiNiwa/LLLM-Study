import { useState } from 'react';
import { CheckCircle2, CircleDot, Loader2, PencilLine, Sparkles, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import type { CardRecord } from '@/lib/db/types';
import type { AnswerCheck, AnswerVerdict } from '@/lib/srs/answerCheck';
import { cn } from '@/lib/utils/cn';
import { errorMessage } from '@/lib/utils/format';
import { useAiBusy } from '@/features/ai/aiBusy';
import { judgePrompt, parseJudge, type JudgeResult } from '@/features/ai/judge';
import { runOneshotParsed } from '@/features/ai/oneshot';
import { getPersona } from '@/features/ai/personas';
import { cardForLlm } from '@/features/ai/studyContext';
import { useSettings } from '@/features/settings/settingsStore';
import { useAiReady } from '@/features/cloud/aiClient';

const VIEW: Record<AnswerVerdict, { label: string; icon: typeof CheckCircle2; className: string }> =
  {
    correct: {
      label: '正解',
      icon: CheckCircle2,
      className: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200',
    },
    close: {
      label: '惜しい',
      icon: CircleDot,
      className: 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
    },
    wrong: {
      label: '不正解',
      icon: XCircle,
      className: 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200',
    },
  };

interface AnswerResultProps {
  card: CardRecord;
  answer: string;
  /** プログラムの答え合わせ（正解の候補がないカードは null） */
  check: AnswerCheck | null;
  /** 今の判定（プログラムで言い切れないときは null。AI の判定があればそれ） */
  verdict: AnswerVerdict | null;
  /** AI の判定で評価のおすすめが変わったとき */
  onJudged: (verdict: AnswerVerdict) => void;
}

/** 入力した答えの答え合わせの結果。プログラムの判定に、必要なら AI の判定を重ねる */
export function AnswerResult({ card, answer, check, verdict, onJudged }: AnswerResultProps) {
  const ready = useAiReady();
  const busy = useAiBusy((s) => s.task !== null && s.task !== 'reaction');
  const personaId = useSettings((s) => s.persona);
  const custom = useSettings((s) => s.customPersona);
  const [judging, setJudging] = useState(false);
  const [judge, setJudge] = useState<JudgeResult | null>(null);
  const view = verdict ? VIEW[verdict] : null;
  const Icon = view?.icon ?? PencilLine;
  // 判定が「正解」以外で、まだ AI に聞いていなければ、AI に判定してもらえる
  const canAsk = verdict !== 'correct' && !judge && !!answer.trim() && ready;

  const askAi = async () => {
    const json = await cardForLlm(card, { revealed: true });
    if (!json) return;
    setJudging(true);
    try {
      const { value: parsed, cancelled } = await runOneshotParsed(
        {
          task: 'assist',
          prompt: judgePrompt(json, answer, check?.expected ?? ''),
          maxOutputTokens: 200,
          // 同じ答えには同じ判定を返してほしいので、温度を低くする
          purpose: 'judge',
        },
        parseJudge,
      );
      // 止めた（カードが変わったなど）ときは、途中までの出力を判定に使わない
      if (cancelled) return;
      if (!parsed) throw new Error('AI の判定を読み取れませんでした');
      setJudge(parsed);
      onJudged(parsed.verdict);
    } catch (e) {
      toast.error('AI に判定してもらえませんでした', { description: errorMessage(e) });
    } finally {
      setJudging(false);
    }
  };

  return (
    <div
      className={cn(
        'mt-6 space-y-2 rounded-xl px-4 py-3 text-sm',
        view?.className ?? 'bg-slate-100 text-slate-800 dark:bg-slate-800/60 dark:text-slate-200',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1 font-semibold">
          <Icon className="size-4" />
          {view?.label ?? '自分で答え合わせ'}
          {judge && <span className="text-xs font-normal opacity-75">（AI の判定）</span>}
        </span>
        <span className="min-w-0 break-words whitespace-pre-wrap">
          あなたの答え: <strong>{answer || '（空欄）'}</strong>
        </span>
      </div>
      {verdict && verdict !== 'correct' && !judge && check && (
        <p className="opacity-90">正解: {check.expected}</p>
      )}
      {!verdict && !judge && <p className="opacity-90">下の正解と見比べて、評価を選んでください</p>}
      {judge && (
        <p>
          <span aria-hidden>{getPersona(personaId, custom).emoji} </span>
          {judge.comment}
        </p>
      )}
      {canAsk && (
        <Button
          size="sm"
          variant="secondary"
          disabled={judging || busy}
          onClick={() => void askAi()}
        >
          {judging ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {verdict ? '言い換えかも？ AI に判定してもらう' : 'AI に判定してもらう'}
        </Button>
      )}
    </div>
  );
}
