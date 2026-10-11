import { useEffect, useRef, useState, type ReactNode } from 'react';
import { EllipsisVertical } from 'lucide-react';
import { Link } from 'wouter';
import { cn } from '@/lib/utils/cn';
import { SUB_NAV_ITEMS } from './navItems';

interface PageHeaderProps {
  title: string;
  /** タイトル右側（見出しの横）に置く要素 */
  meta?: ReactNode;
  /** 右端のアクション */
  actions?: ReactNode;
  /** スマホではタイトルを隠す（下部ナビで現在地が分かるため。ヘッダーの幅を確保） */
  hideTitleOnMobile?: boolean;
}

/** スマホ用: 下部ナビに入りきらないページ（AI モデル・設定・ヘルプ）へのメニュー */
function MobileMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative md:hidden">
      <button
        type="button"
        aria-label="メニュー"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <EllipsisVertical className="size-5" />
      </button>
      {open && (
        <div className="absolute top-11 right-0 z-30 w-48 animate-fade-in overflow-hidden rounded-2xl border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          {SUB_NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              href={to}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Icon className="size-5 text-slate-500" />
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export function PageHeader({ title, meta, actions, hideTitleOnMobile }: PageHeaderProps) {
  return (
    <header className="pt-safe sticky top-0 z-20 shrink-0 border-b border-slate-200 bg-slate-50/85 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/85">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-4">
        <img src="./favicon.svg" alt="" className="size-7 md:hidden" />
        <h1
          className={cn(
            'truncate text-base font-semibold sm:text-lg',
            hideTitleOnMobile && 'max-sm:sr-only',
          )}
        >
          {title}
        </h1>
        {meta && <div className="min-w-0">{meta}</div>}
        <div className="ml-auto flex items-center gap-1">
          {actions}
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}

/** スクロール可能なページ本体 */
export function PageBody({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div
        className={cn(
          'mx-auto w-full space-y-4 px-3 py-4 sm:px-4 sm:py-6',
          wide ? 'max-w-5xl' : 'max-w-3xl',
        )}
      >
        {children}
      </div>
    </div>
  );
}
