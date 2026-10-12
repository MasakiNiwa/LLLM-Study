import { ChevronRight } from 'lucide-react';
import { Link } from 'wouter';
import { cn } from '@/lib/utils/cn';
import { formatPercent } from '@/lib/utils/format';
import { useEngine } from './engineStore';

/** 現在のモデル状態を表示する小さなチップ（クリックでモデル画面へ） */
export function ModelStatusChip({
  className,
  plain,
}: {
  className?: string;
  /** リンクにせず状態だけを表示する（リンクの中に置くとき） */
  plain?: boolean;
}) {
  const status = useEngine((s) => s.status);
  const model = useEngine((s) => s.model);
  const loadingName = useEngine((s) => s.loadingName);
  const progress = useEngine((s) => s.progress);

  let dot = 'bg-slate-400';
  let label = 'モデル未読み込み';
  /** 幅が足りなくても省略しない部分（読み込みの割合など） */
  let suffix = '';
  if (status === 'ready' && model) {
    dot = 'bg-emerald-500';
    label = model.name.replace(/\.litertlm$/, '');
  } else if (status === 'loading') {
    dot = 'bg-amber-500 animate-pulse';
    const ratio = progress?.totalBytes ? progress.loadedBytes / progress.totalBytes : 0;
    if (progress?.phase === 'initializing') label = '初期化中…';
    else if (progress?.phase === 'reading') {
      label = '読み込み中';
      suffix = formatPercent(ratio);
    } else {
      label = loadingName?.replace(/\.litertlm$/, '') ?? '';
      suffix = '準備中…';
    }
  } else if (status === 'error') {
    dot = 'bg-rose-500';
    label = '読み込みエラー';
  }

  const full = [label, suffix].filter(Boolean).join(' ');

  if (plain) {
    return (
      <span
        className={cn(
          'inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
          className,
        )}
      >
        <span className={cn('size-2 shrink-0 rounded-full', dot)} />
        {label && <span className="truncate">{label}</span>}
        {suffix && <span className="shrink-0 tabular-nums">{suffix}</span>}
      </span>
    );
  }

  return (
    <Link
      href="/models"
      title={`AI モデル: ${full}（押すとモデルの画面へ）`}
      aria-label={`AI モデル: ${full}。モデルの画面を開く`}
      className={cn(
        'inline-flex max-w-full min-w-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
        className,
      )}
    >
      <span className={cn('size-2 shrink-0 rounded-full', dot)} />
      {label && <span className="truncate">{label}</span>}
      {suffix && <span className="shrink-0 tabular-nums">{suffix}</span>}
      <ChevronRight className="-mr-1 size-3.5 shrink-0 text-slate-400" />
    </Link>
  );
}
