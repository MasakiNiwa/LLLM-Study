import { useState, type ReactNode } from 'react';
import { BrainCircuit } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils/cn';
import { APP_TITLE } from '@/lib/constants';
import { ModelStatusChip } from '@/features/engine/ModelStatusChip';
import { AI_TOOL_ITEMS, NAV_ITEMS, SETTINGS_ITEM, SUB_NAV_ITEMS, type NavItem } from './navItems';
import { AiToolsSheet } from './AiToolsSheet';
import { ThemeToggle } from './ThemeToggle';

function Logo() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <img src="./favicon.svg" alt="" className="size-8" />
      <div className="leading-tight">
        <div className="text-sm font-bold tracking-tight">{APP_TITLE}</div>
        <div className="text-[0.7rem] text-slate-500 dark:text-slate-400">
          ローカル LLM の学習アプリ
        </div>
      </div>
    </div>
  );
}

function isActivePath(location: string, to: string): boolean {
  return to === '/' ? location === '/' : location === to || location.startsWith(`${to}/`);
}

function SideLink({ item, location }: { item: NavItem; location: string }) {
  const active = isActivePath(location, item.to);
  const Icon = item.icon;
  return (
    <Link
      href={item.to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-accent-50 text-accent-800 dark:bg-accent-900/30 dark:text-accent-200'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white',
      )}
    >
      <Icon className="size-5" />
      {item.label}
    </Link>
  );
}

/** PC: 左サイドバー */
function SideNav() {
  const [location] = useLocation();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-slate-200 bg-white/70 p-3 md:flex dark:border-slate-800 dark:bg-slate-900/60">
      <div className="py-2">
        <Logo />
      </div>
      <nav className="mt-4 flex flex-col gap-1" aria-label="メイン">
        {NAV_ITEMS.map((item) => (
          <SideLink key={item.to} item={item} location={location} />
        ))}
      </nav>
      <nav
        className="mt-4 flex flex-col gap-1 border-t border-slate-200 pt-4 dark:border-slate-800"
        aria-label="AI で練習"
      >
        <div className="px-3 pb-1 text-xs font-semibold text-slate-400">AI で練習</div>
        {AI_TOOL_ITEMS.map((item) => (
          <SideLink key={item.to} item={item} location={location} />
        ))}
      </nav>
      <nav
        className="mt-4 flex flex-col gap-1 border-t border-slate-200 pt-4 dark:border-slate-800"
        aria-label="その他"
      >
        {SUB_NAV_ITEMS.map((item) => (
          <SideLink key={item.to} item={item} location={location} />
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-1">
        <ModelStatusChip className="min-w-0 flex-1 justify-start" />
        <ThemeToggle className="shrink-0" />
      </div>
    </aside>
  );
}

const bottomItemClass = (active: boolean) =>
  cn(
    // 7 つ並べるので、幅の狭いスマホでは文字を少し小さく・詰めて表示する
    'flex min-w-0 flex-col items-center gap-0.5 pt-2 pb-1.5 text-[0.6rem] font-medium tracking-tighter whitespace-nowrap transition-colors min-[400px]:text-[0.65rem] min-[400px]:tracking-normal',
    active
      ? 'text-accent-700 dark:text-accent-300'
      : 'text-slate-500 active:text-slate-800 dark:text-slate-400',
  );

function BottomIcon({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'flex h-7 w-11 items-center justify-center rounded-full transition-colors [&_svg]:size-5',
        active && 'bg-accent-100 dark:bg-accent-900/40',
      )}
    >
      {children}
    </span>
  );
}

/**
 * スマホ: 画面下部のナビゲーションバー。
 * メインのページ・「AI練習」（例文クイズや会話練習を選ぶシート）・右端に設定。
 */
function BottomNav() {
  const [location] = useLocation();
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolActive = AI_TOOL_ITEMS.some((t) => isActivePath(location, t.to));
  return (
    <nav
      aria-label="メイン"
      className="pb-safe shrink-0 border-t border-slate-200 bg-white/90 backdrop-blur-md md:hidden dark:border-slate-800 dark:bg-slate-900/90"
    >
      <div className="grid grid-cols-7">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
          const active = isActivePath(location, to);
          return (
            <Link
              key={to}
              href={to}
              aria-current={active ? 'page' : undefined}
              className={bottomItemClass(active)}
            >
              <BottomIcon active={active}>
                <Icon />
              </BottomIcon>
              {label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setToolsOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={toolsOpen}
          className={bottomItemClass(toolActive)}
        >
          <BottomIcon active={toolActive}>
            <BrainCircuit />
          </BottomIcon>
          AI練習
        </button>
        <Link
          href={SETTINGS_ITEM.to}
          aria-current={isActivePath(location, SETTINGS_ITEM.to) ? 'page' : undefined}
          className={bottomItemClass(isActivePath(location, SETTINGS_ITEM.to))}
        >
          <BottomIcon active={isActivePath(location, SETTINGS_ITEM.to)}>
            <SETTINGS_ITEM.icon />
          </BottomIcon>
          {SETTINGS_ITEM.label}
        </Link>
      </div>
      <AiToolsSheet open={toolsOpen} onClose={() => setToolsOpen(false)} />
    </nav>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh overflow-hidden">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="relative flex min-h-0 flex-1 flex-col">{children}</main>
        <BottomNav />
      </div>
    </div>
  );
}
