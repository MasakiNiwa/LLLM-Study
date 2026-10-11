import { format } from 'date-fns';
import { Pause, Pencil, Play } from 'lucide-react';
import type { ItemStatus, ItemSummary } from '@/lib/data/stats';
import { cn } from '@/lib/utils/cn';

const STATUS_VIEW: Record<ItemStatus, { label: string; className: string }> = {
  new: {
    label: '未学習',
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  },
  learning: {
    label: '学習中',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  },
  review: {
    label: '復習中',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  },
  mature: {
    label: '定着',
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200',
  },
  suspended: {
    label: '停止中',
    className: 'bg-slate-200 text-slate-500 line-through dark:bg-slate-800 dark:text-slate-400',
  },
};

interface ItemRowProps {
  item: ItemSummary;
  /** 教材名（全教材の検索結果で表示） */
  packTitle?: string;
  onToggleSuspend: () => void;
  onEdit?: () => void;
}

/** 項目 1 行（状態・次回の予定・出題の停止/再開・編集） */
export function ItemRow({ item, packTitle, onToggleSuspend, onEdit }: ItemRowProps) {
  const view = STATUS_VIEW[item.status];
  const suspended = item.status === 'suspended';
  return (
    <li className="flex items-center gap-2 px-3 py-2 text-sm">
      <div className={cn('min-w-0 flex-1', suspended && 'opacity-60')}>
        <div className="truncate font-medium">{item.title}</div>
        <div className="truncate text-xs text-slate-500">{item.answer}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[0.7rem] text-slate-500">
          <span className={cn('rounded px-1.5 py-px font-medium', view.className)}>
            {view.label}
          </span>
          {item.nextDue !== undefined && <span>次回 {format(item.nextDue, 'M/d')}</span>}
          {packTitle && <span className="truncate">{packTitle}</span>}
        </div>
      </div>
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`${item.title} を編集`}
          title="編集"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Pencil className="size-4" />
        </button>
      )}
      <button
        type="button"
        onClick={onToggleSuspend}
        aria-label={suspended ? `${item.title} の出題を再開` : `${item.title} の出題を止める`}
        title={suspended ? '出題を再開' : '出題を止める'}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        {suspended ? <Play className="size-4" /> : <Pause className="size-4" />}
      </button>
    </li>
  );
}
