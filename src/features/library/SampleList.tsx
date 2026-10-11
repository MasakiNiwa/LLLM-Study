import { useEffect, useState } from 'react';
import { Check, Download, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { fetchSampleIndex, type SampleEntry } from '@/lib/packs/samples';
import { subjectKey, subjectLabel } from '@/lib/packs/subjects';
import { ITEM_TYPE_LABELS } from '@/lib/packs/templates';
import { errorMessage } from '@/lib/utils/format';
import { installSample } from './packActions';
import { useLibrary } from './libraryStore';

/** リポジトリに同梱しているサンプル教材の一覧（追加・更新） */
export function SampleList({ compact }: { compact?: boolean }) {
  const [samples, setSamples] = useState<SampleEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const packs = useLibrary((s) => s.packs);
  const loaded = useLibrary((s) => s.loaded);

  useEffect(() => {
    fetchSampleIndex().then(setSamples, (e: unknown) => setError(errorMessage(e)));
    if (!useLibrary.getState().loaded) void useLibrary.getState().refresh();
  }, []);

  if (error)
    return (
      <p className="px-1 text-sm text-rose-600">サンプル教材を読み込めませんでした: {error}</p>
    );
  if (!samples || !loaded) {
    return (
      <div className="flex justify-center py-6 text-slate-400">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {samples.map((s) => {
        const installed = packs.find((p) => p.id === s.id);
        const updatable = installed && (installed.revision ?? 1) < s.revision;
        return (
          <li
            key={s.id}
            className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{s.title}</div>
              {!compact && s.description && (
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">{s.description}</p>
              )}
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                <span>{subjectLabel(subjectKey(s.subject))}</span>
                <span>{s.itemCount} 項目</span>
                <span>{s.itemTypes.map((t) => ITEM_TYPE_LABELS[t]).join('・')}</span>
                {s.level && <span>{s.level}</span>}
              </div>
            </div>
            <Button
              size="sm"
              variant={installed && !updatable ? 'ghost' : 'primary'}
              disabled={busy !== null || (!!installed && !updatable)}
              onClick={async () => {
                setBusy(s.id);
                await installSample(s);
                setBusy(null);
              }}
            >
              {busy === s.id ? (
                <Loader2 className="animate-spin" />
              ) : updatable ? (
                <RefreshCw />
              ) : installed ? (
                <Check />
              ) : (
                <Download />
              )}
              {updatable ? '更新' : installed ? '追加済み' : '追加'}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}
