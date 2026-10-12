import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface TabsProps<T extends string> {
  value: T;
  items: TabItem<T>[];
  onChange: (value: T) => void;
  className?: string;
}

/** セグメント型のタブ（横幅が足りなければ横スクロール） */
export function Tabs<T extends string>({ value, items, onChange, className }: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        'flex gap-1 overflow-x-auto rounded-2xl bg-slate-200/60 p-1 dark:bg-slate-800/60',
        className,
      )}
    >
      {items.map((t) => (
        <button
          key={t.value}
          type="button"
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'flex min-w-fit flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-1.5 text-xs font-medium whitespace-nowrap transition-colors sm:flex-row sm:gap-1.5 sm:px-3 sm:py-2 sm:text-sm [&_svg]:size-4',
            value === t.value
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
              : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white',
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}
