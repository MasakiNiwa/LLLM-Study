/**
 * モデルを選ぶ欄（API キーごと）。「AI モデル」画面・切り替えのシート・応答ごとの AI で使う。
 * - 今のモデルのボタン: 押すとモデルの一覧（検索・絞り込み・料金など）を開く
 * - マイモデル（★ を付けたモデル）は、ボタンの下に並べて 1 回で切り替えられる
 */
import { useState } from 'react';
import { ChevronsUpDown } from 'lucide-react';
import type { CloudKeyId } from '@/lib/cloud/keyVault';
import { CLOUD_PROVIDERS } from '@/lib/cloud/providers';
import { cn } from '@/lib/utils/cn';
import { useSettings } from '@/features/settings/settingsStore';
import { selectCloudModel, useCloud } from './cloudStore';
import { ModelCatalog } from './ModelCatalog';
import { formatPrice } from './modelFormat';

/**
 * value・onChange を渡さなければ、そのキーの「使うモデル」（cloudModels）を選ぶ。
 * 渡せば、別の設定（応答ごとの AI など）のモデルを選ぶ
 */
export function ModelPicker({
  keyId,
  value,
  onChange,
  showMine = true,
}: {
  keyId: CloudKeyId;
  value?: string;
  onChange?: (model: string) => void;
  /** マイモデルを並べる */
  showMine?: boolean;
}) {
  const current = useSettings((s) => s.cloudModels[keyId] ?? '');
  const model = value ?? current;
  const choose = onChange ?? ((m: string) => selectCloudModel(keyId, m));
  const key = useCloud((s) => s.keys.find((k) => k.id === keyId));
  const info = useCloud((s) => s.catalogs[keyId]?.models.find((m) => m.id === model));
  const [open, setOpen] = useState(false);
  if (!key) return null;
  const short = CLOUD_PROVIDERS[key.provider].shortModel;
  const price = info && formatPrice(info);
  const mine = key.models.filter((m) => m !== model);

  return (
    <div className="min-w-0 space-y-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="モデルを選ぶ"
        className="flex h-10 w-full min-w-0 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-left text-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <span className="min-w-0 flex-1 truncate">{model || 'モデルを選ぶ'}</span>
        {price && (
          <span
            className={cn(
              'shrink-0 rounded px-1.5 py-0.5 text-[11px]',
              info?.free
                ? 'bg-teal-50 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200'
                : 'text-slate-500 dark:text-slate-400',
            )}
          >
            {price}
          </span>
        )}
        {info?.tools === false && (
          <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            ツール非対応
          </span>
        )}
        <ChevronsUpDown className="size-4 shrink-0 text-slate-500" />
      </button>
      {showMine && mine.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="マイモデル">
          {mine.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => choose(m)}
              className="max-w-full truncate rounded-full border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              title={m}
            >
              ★ {short(m)}
            </button>
          ))}
        </div>
      )}
      <ModelCatalog
        keyId={keyId}
        open={open}
        onClose={() => setOpen(false)}
        value={model}
        onSelect={choose}
      />
    </div>
  );
}
