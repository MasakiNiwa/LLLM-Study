import { Loader2 } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { formatBytes, formatPercent } from '@/lib/utils/format';
import { useEngine } from '@/features/engine/engineStore';

const PHASE_LABEL = {
  runtime: 'ランタイム（Wasm）を準備中',
  reading: 'モデルを読み込み中',
  initializing: 'エンジンを初期化中（GPU シェーダーのコンパイルなど）',
} as const;

export function LoadProgressCard() {
  const status = useEngine((s) => s.status);
  const progress = useEngine((s) => s.progress);
  const name = useEngine((s) => s.loadingName);
  if (status !== 'loading') return null;

  const phase = progress?.phase ?? 'runtime';
  const total = progress?.totalBytes ?? 0;
  const ratio = total ? (progress?.loadedBytes ?? 0) / total : undefined;
  const saveRatio =
    total && progress?.saveLoadedBytes !== undefined ? progress.saveLoadedBytes / total : undefined;

  return (
    <Card className="animate-fade-in space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin text-accent-600" />
        <span className="truncate font-medium">{name}</span>
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm text-slate-600 dark:text-slate-400">
          <span>{PHASE_LABEL[phase]}</span>
          {phase === 'reading' && ratio !== undefined && (
            <span className="font-mono tabular-nums">
              {formatBytes(progress?.loadedBytes)} / {formatBytes(total)} ({formatPercent(ratio)})
            </span>
          )}
        </div>
        <Progress value={phase === 'reading' ? ratio : undefined} />
      </div>
      {saveRatio !== undefined && (
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>ブラウザに保存中</span>
            <span className="font-mono tabular-nums">{formatPercent(saveRatio)}</span>
          </div>
          <Progress value={saveRatio} className="h-1" />
        </div>
      )}
    </Card>
  );
}
