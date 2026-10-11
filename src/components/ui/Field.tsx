import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

interface FieldProps {
  label: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  /** true: ラベルと入力を縦に並べる（テキストエリアなど） */
  stacked?: boolean;
  className?: string;
}

/** ラベル + 入力コントロールの 1 行 */
export function Field({ label, htmlFor, hint, children, stacked, className }: FieldProps) {
  return (
    <div
      className={cn(
        'px-4 py-3.5 sm:px-5',
        stacked ? 'space-y-2' : 'flex items-center justify-between gap-4',
        className,
      )}
    >
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-medium">
          {label}
        </label>
        {hint && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
      </div>
      {children}
    </div>
  );
}
