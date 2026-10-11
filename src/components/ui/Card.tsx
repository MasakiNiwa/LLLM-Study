import { useId, useState, type HTMLAttributes, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
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
  /** 見出しを押して折りたためるようにする */
  collapsible?: boolean;
  /** 折りたためるとき、最初に開いておく */
  defaultOpen?: boolean;
  /** 開閉の状態を覚えておくキー（同じページの見出しで共通。例: "settings"） */
  storageKey?: string;
}

function readOpen(key: string | undefined, fallback: boolean): boolean {
  if (!key) return fallback;
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writeOpen(key: string | undefined, open: boolean): void {
  if (!key) return;
  try {
    localStorage.setItem(key, open ? '1' : '0');
  } catch {
    // 保存できなくても開閉はできる
  }
}

/** 設定・ヘルプ画面などで使う見出し付きカード（折りたたみ可） */
export function Section({
  title,
  description,
  icon,
  children,
  className,
  collapsible,
  defaultOpen = false,
  storageKey,
}: SectionProps) {
  const key = collapsible && storageKey ? `lllm-study:open:${storageKey}:${title}` : undefined;
  const [open, setOpen] = useState(() => !collapsible || readOpen(key, defaultOpen));
  const contentId = useId();
  const heading = (
    <>
      {icon && (
        <div className="mt-0.5 text-accent-600 dark:text-accent-400 [&_svg]:size-5">{icon}</div>
      )}
      <div className="min-w-0 flex-1 text-left">
        <h2 className="font-semibold">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
        )}
      </div>
    </>
  );
  return (
    <Card className={cn('overflow-hidden', className)}>
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={() => {
            setOpen(!open);
            writeOpen(key, !open);
          }}
          className={cn(
            'flex w-full items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 sm:px-5 dark:hover:bg-slate-800/40',
            open && 'border-b border-slate-100 dark:border-slate-800',
          )}
        >
          {heading}
          <ChevronDown
            className={cn(
              'mt-0.5 size-5 shrink-0 text-slate-400 transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      ) : (
        <div className="flex items-start gap-3 border-b border-slate-100 px-4 py-3 sm:px-5 dark:border-slate-800">
          {heading}
        </div>
      )}
      {open && (
        <div id={contentId} className="divide-y divide-slate-100 dark:divide-slate-800">
          {children}
        </div>
      )}
    </Card>
  );
}
