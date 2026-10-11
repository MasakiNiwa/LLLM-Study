import type { ReactNode } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils/cn';
import { HELP_ITEM } from './navItems';

interface PageHeaderProps {
  title: string;
  /** タイトル右側（見出しの横）に置く要素 */
  meta?: ReactNode;
  /** 右端のアクション */
  actions?: ReactNode;
  /** スマホではタイトルを隠す（下部ナビで現在地が分かるため。ヘッダーの幅を確保） */
  hideTitleOnMobile?: boolean;
  /** スマホのヘルプのボタンを出さない（ヘッダーのボタンが多いページ） */
  hideHelp?: boolean;
}

/** スマホ用: ヘッダー右端のヘルプ（PC はサイドバーにある） */
function MobileHelp() {
  const [location] = useLocation();
  if (location === HELP_ITEM.to) return null;
  return (
    <Link
      href={HELP_ITEM.to}
      aria-label={HELP_ITEM.label}
      title={HELP_ITEM.label}
      className="flex size-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-200/70 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"
    >
      <HELP_ITEM.icon className="size-5" />
    </Link>
  );
}

export function PageHeader({ title, meta, actions, hideTitleOnMobile, hideHelp }: PageHeaderProps) {
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
          {!hideHelp && <MobileHelp />}
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
