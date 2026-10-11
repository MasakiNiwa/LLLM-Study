import { Link } from 'wouter';
import { cn } from '@/lib/utils/cn';
import { formatPercent } from '@/lib/utils/format';
import { useEngine } from './engineStore';

/** 現在のモデル状態を表示する小さなチップ（クリックでモデル画面へ） */
export function ModelStatusChip({ className }: { className?: string }) {
  const status = useEngine((s) => s.status);
  const model = useEngine((s) => s.model);
  const loadingName = useEngine((s) => s.loadingName);
  const progress = useEngine((s) => s.progress);

  let dot = 'bg-slate-400';
  let label = 'モデル未読み込み';
  if (status === 'ready' && model) {
    dot = 'bg-emerald-500';
    label = model.name.replace(/\.litertlm$/, '');
  } else if (status === 'loading') {
    dot = 'bg-amber-500 animate-pulse';
    const ratio = progress?.totalBytes ? progress.loadedBytes / progress.totalBytes : 0;
    label =
      progress?.phase === 'initializing'
        ? '初期化中…'
        : progress?.phase === 'reading'
          ? `読み込み中 ${formatPercent(ratio)}`
          : `${loadingName ?? ''} 準備中…`;
  } else if (status === 'error') {
    dot = 'bg-rose-500';
    label = '読み込みエラー';
  }

  return (
    <Link
      href="/models"
      title={label}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
        className,
      )}
    >
      <span className={cn('size-2 shrink-0 rounded-full', dot)} />
      <span className="truncate">{label}</span>
    </Link>
  );
}
