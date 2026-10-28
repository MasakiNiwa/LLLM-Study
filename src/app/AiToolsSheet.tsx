import { ChevronRight } from 'lucide-react';
import { Link } from 'wouter';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useSheetClose } from '@/components/ui/sheetContext';
import { ModelStatusChip } from '@/features/engine/ModelStatusChip';
import { AI_TOOL_ITEMS, MODELS_ITEM } from './navItems';
import { useAiReady } from '@/features/cloud/aiClient';

/**
 * スマホ: 下部ナビの「AI練習」から開く選択画面（画面の下から出るシート）。
 * チャット以外の AI の機能（例文クイズ・会話練習など）と、AI モデルの画面への入口をまとめる。
 */
export function AiToolsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="AI で練習">
      <AiToolsList />
    </BottomSheet>
  );
}

function AiToolsList() {
  const ready = useAiReady();
  const close = useSheetClose();
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {AI_TOOL_ITEMS.map(({ to, label, description, icon: Icon }) => (
          <li key={to}>
            <Link
              href={to}
              onClick={close}
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
          {ready ? '使う AI（押すと切り替え）' : 'AI の機能は、AI モデルを読み込むと使えます'}
        </span>
        <ModelStatusChip className="max-w-48" />
      </div>
      <Link
        href={MODELS_ITEM.to}
        onClick={close}
        className="flex items-center justify-center gap-1 py-1 text-sm font-medium text-accent-700 dark:text-accent-300"
      >
        <MODELS_ITEM.icon className="size-4" />
        AI モデルの管理
      </Link>
    </div>
  );
}
