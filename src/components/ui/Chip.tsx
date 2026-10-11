import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

/** 選択式の小さなボタン（押すとオン・オフが切り替わる） */
export function Chip({
  active,
  onClick,
  children,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      title={title}
      className={cn(
        'rounded-xl border px-3 py-1.5 text-sm transition-colors',
        active
          ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-900/30 dark:text-accent-200'
          : 'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800',
      )}
    >
      {children}
    </button>
  );
}
