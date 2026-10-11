import { useState } from 'react';
import { Link } from 'wouter';
import { Loader2, MessageCircleHeart, Sparkles, Square } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { dataWorker } from '@/lib/data/client';
import type { StatsData } from '@/lib/data/stats';
import { errorMessage } from '@/lib/utils/format';
import { getPersona } from '@/features/ai/personas';
import { useAiBusy } from '@/features/ai/aiBusy';
import { cancelAi, runOneshot } from '@/features/ai/oneshot';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings } from '@/features/settings/settingsStore';
import { reviewPrompt, summaryLines, weeklySummary } from './review';

/** 苦手な項目として AI に渡す数 */
const WEAK_ITEMS = 5;
/** 思い出せる確率（%）がこれより低ければ苦手とみなす */
const WEAK_RECALL = 85;

/** 苦手な項目（AI に渡すので長い問題文は短くする） */
async function weakItems(packId?: string) {
  const weak = await dataWorker().weakItems(Date.now(), WEAK_ITEMS, packId);
  // 本当に苦手なものだけ（忘れたことがある・思い出せる確率が下がっている）。無ければ AI に渡さない
  return weak
    .filter((w) => w.lapses > 0 || w.recall < WEAK_RECALL)
    .map((w) => ({ title: w.title.slice(0, 60), lapses: w.lapses }));
}

/**
 * 1 週間のふりかえり。数字のまとめはアプリが出し、AI パートナーがそれを受けてコメントする。
 * 集計する教材を切り替えたら作り直す（key で）。
 */
export function WeeklyReview({
  stats,
  packId,
  scope,
}: {
  stats: StatsData;
  packId?: string;
  /** 集計の範囲（「すべての教材」や教材名） */
  scope: string;
}) {
  const summary = weeklySummary(stats);
  const lines = summaryLines(summary);
  const engineReady = useEngine((s) => s.status === 'ready');
  const busy = useAiBusy((s) => s.task);
  const personaId = useSettings((s) => s.persona);
  const custom = useSettings((s) => s.customPersona);
  const persona = getPersona(personaId, custom);
  const [text, setText] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    setText('');
    try {
      const r = await runOneshot({
        task: 'review',
        prompt: reviewPrompt(summary, await weakItems(packId), scope),
        maxOutputTokens: 400,
        onText: setText,
      });
      setText(r.text);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <MessageCircleHeart className="size-5 text-accent-600" />
        <h2 className="flex-1 font-semibold">今週のふりかえり</h2>
      </div>
      <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      {(text || running) && (
        <div className="flex items-start gap-2">
          <span className="text-2xl" aria-hidden>
            {persona.emoji}
          </span>
          <p
            aria-live="polite"
            className="min-w-0 flex-1 rounded-2xl rounded-tl-sm bg-accent-50 px-3 py-2 text-sm leading-relaxed whitespace-pre-line dark:bg-accent-900/20"
          >
            {text || <Loader2 className="size-4 animate-spin text-accent-600" />}
          </p>
        </div>
      )}
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {engineReady ? (
        running ? (
          <Button size="sm" variant="secondary" onClick={cancelAi}>
            <Square />
            止める
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void run()}
            disabled={busy !== null || summary.thisWeek.reviews + summary.lastWeek.reviews === 0}
          >
            <Sparkles />
            {text ? 'もう一度ふりかえってもらう' : `${persona.name}にふりかえってもらう`}
          </Button>
        )
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          <Link href="/models" className="text-accent-700 underline dark:text-accent-300">
            AI モデル
          </Link>
          を読み込むと、AI パートナーがこの 1 週間をふりかえってコメントしてくれます。
        </p>
      )}
    </Card>
  );
}
