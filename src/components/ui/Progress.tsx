import { cn } from '@/lib/utils/cn';

interface ProgressProps {
  /** 0〜1。undefined で不確定（アニメーション）表示 */
  value?: number;
  className?: string;
}

export function Progress({ value, className }: ProgressProps) {
  const indeterminate = value === undefined;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}
      className={cn(
        'h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800',
        className,
      )}
    >
      <div
        className={cn(
          'h-full rounded-full bg-accent-500',
          indeterminate
            ? 'w-1/3 animate-[progress-indeterminate_1.2s_ease-in-out_infinite]'
            : 'transition-[width] duration-150',
        )}
        style={indeterminate ? undefined : { width: `${Math.min(1, Math.max(0, value)) * 100}%` }}
      />
      <style>{`@keyframes progress-indeterminate{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}`}</style>
    </div>
  );
}
