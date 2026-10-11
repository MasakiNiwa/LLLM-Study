import { useEffect, useRef } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/Button';
import { ModelStatusChip } from '@/features/engine/ModelStatusChip';
import { useEngine } from '@/features/engine/engineStore';
import { AI_TOOL_ITEMS, MODELS_ITEM } from './navItems';

/**
 * スマホ: 下部ナビの「AI練習」から開く選択画面（画面の下から出るシート）。
 * チャット以外の AI の機能（例文クイズ・会話練習など）と、AI モデルの画面への入口をまとめる。
 */
export function AiToolsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const ready = useEngine((s) => s.status === 'ready');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-label="AI で練習"
      className="pb-safe fixed inset-x-0 top-auto bottom-0 m-0 w-full max-w-none rounded-t-3xl border-t border-slate-200 bg-white p-0 text-slate-900 shadow-2xl open:animate-[sheet-up_0.2s_ease-out] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
    >
      <style>{`@keyframes sheet-up{from{transform:translateY(100%)}to{transform:none}}`}</style>
      {open && (
        <div className="mx-auto max-w-lg space-y-3 p-4">
          <div className="mx-auto h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
          <div className="flex items-center gap-2">
            <h2 className="flex-1 text-lg font-semibold">AI で練習</h2>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="閉じる">
              <X />
            </Button>
          </div>
          <ul className="space-y-2">
            {AI_TOOL_ITEMS.map(({ to, label, description, icon: Icon }) => (
              <li key={to}>
                <Link
                  href={to}
                  onClick={onClose}
                  className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60"
                >
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300">
                    <Icon className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{label}</span>
                    {description && (
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        {description}
                      </span>
                    )}
                  </span>
                  <ChevronRight className="size-5 shrink-0 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <span className="min-w-0 flex-1 text-xs text-slate-600 dark:text-slate-400">
              {ready
                ? '使う AI モデル（押すとモデルの画面へ）'
                : 'AI の機能は、AI モデルを読み込むと使えます'}
            </span>
            <span onClick={onClose}>
              <ModelStatusChip className="max-w-48" />
            </span>
          </div>
          <Link
            href={MODELS_ITEM.to}
            onClick={onClose}
            className="flex items-center justify-center gap-1 py-1 text-sm font-medium text-accent-700 dark:text-accent-300"
          >
            <MODELS_ITEM.icon className="size-4" />
            AI モデルの管理
          </Link>
        </div>
      )}
    </dialog>
  );
}
