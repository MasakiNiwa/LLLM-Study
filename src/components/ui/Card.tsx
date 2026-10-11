import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900',
        className,
      )}
      {...props}
    />
  );
}

interface SectionProps {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** 設定・ヘルプ画面などで使う見出し付きカード */
export function Section({ title, description, icon, children, className }: SectionProps) {
  return (
    <Card className={cn('overflow-hidden', className)}>
      <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 dark:border-slate-800">
        {icon && (
          <div className="mt-0.5 text-accent-600 dark:text-accent-400 [&_svg]:size-5">{icon}</div>
        )}
        <div className="min-w-0">
          <h2 className="font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          )}
        </div>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">{children}</div>
    </Card>
  );
}
