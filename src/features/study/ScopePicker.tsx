import { useEffect, useState } from 'react';
import { Check, ChevronDown, Infinity as InfinityIcon, Layers } from 'lucide-react';
import { Dialog } from '@/components/ui/Dialog';
import { Switch } from '@/components/ui/Switch';
import { cn } from '@/lib/utils/cn';
import { useLibrary } from '@/features/library/libraryStore';
import { useSettings } from '@/features/settings/settingsStore';
import { useStudy } from './studyStore';

/**
 * 学習する教材（すべて / 1 つに絞る）と、上限なしモードを選ぶ。
 * 学習中に変えたら、新しい条件でキューを組み直す。
 */
export function ScopePicker({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const packs = useLibrary((s) => s.packs);
  const focus = useSettings((s) => s.focusPackId);
  const unlimited = useSettings((s) => s.noDailyLimit);
  const update = useSettings((s) => s.update);

  useEffect(() => {
    if (!useLibrary.getState().loaded) void useLibrary.getState().refresh();
  }, []);

  const focused = packs.find((p) => p.id === focus);
  const label = focused ? focused.title : 'すべての教材';

  const apply = (patch: { focusPackId?: string | null; noDailyLimit?: boolean }) => {
    update(patch);
    const st = useStudy.getState().status;
    if (st === 'studying' || st === 'done') void useStudy.getState().start();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800',
          className,
        )}
        aria-label={`学習する教材: ${label}`}
      >
        <Layers className="size-4 shrink-0 text-accent-600" />
        <span className="truncate">{label}</span>
        {unlimited && (
          <InfinityIcon className="size-4 shrink-0 text-accent-600" aria-label="上限なし" />
        )}
        <ChevronDown className="size-4 shrink-0 text-slate-400" />
      </button>
      <Dialog open={open} title="学習する教材" onClose={() => setOpen(false)}>
        <div className="space-y-4">
          <ul className="space-y-1.5">
            {[
              { id: null, title: 'すべての教材', note: '有効にしている教材をまとめて学習' },
              ...packs.map((p) => ({
                id: p.id as string | null,
                title: p.title,
                note: `${p.itemCount} 項目${p.enabled ? '' : '（無効中）'}`,
              })),
            ].map((o) => {
              const selected = (o.id ?? null) === (focused ? focus : null);
              return (
                <li key={o.id ?? 'all'}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      apply({ focusPackId: o.id });
                      setOpen(false);
                    }}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left',
                      selected
                        ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50',
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{o.title}</span>
                      <span className="block text-xs text-slate-500">{o.note}</span>
                    </span>
                    {selected && <Check className="size-5 shrink-0 text-accent-600" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-3 py-3 dark:bg-slate-800/50">
            <div>
              <div className="text-sm font-medium">1 日の上限なし</div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                新しいカードも復習も、あるだけ出します（設定の上限を使いません）
              </p>
            </div>
            <Switch
              checked={unlimited}
              onChange={(v) => apply({ noDailyLimit: v })}
              label="1 日の上限なし"
            />
          </div>
        </div>
      </Dialog>
    </>
  );
}
