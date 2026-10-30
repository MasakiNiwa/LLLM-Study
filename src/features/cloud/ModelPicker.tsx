/**
 * クラウド AI のモデルを選ぶ欄。「AI モデル」画面と、使う場面で開く切り替えのシートの両方で使う。
 * - 一覧から選ぶ（API から取得した一覧）か、モデル名を直接入力する
 * - OpenRouter はモデルが多いので、押すと検索・絞り込みのできるシートを開く
 */
import { useState } from 'react';
import { ChevronsUpDown, List, Pencil, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import type { CloudProviderId } from '@/lib/cloud/keyVault';
import type { OpenRouterModel } from '@/lib/cloud/openrouter';
import { CLOUD_PROVIDERS } from '@/lib/cloud/providers';
import { useSettings } from '@/features/settings/settingsStore';
import { selectCloudModel, useCloud } from './cloudStore';
import { OpenRouterBrowser } from './OpenRouterBrowser';

function OpenRouterPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const info = useCloud((s) =>
    (s.models.openrouter as OpenRouterModel[]).find((m) => m.id === value),
  );
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="OpenRouter のモデルを選ぶ"
        className="flex h-10 min-w-0 flex-1 basis-48 items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-left text-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <span className="min-w-0 flex-1 truncate">{value || 'モデルを選ぶ'}</span>
        {info?.free && (
          <span className="shrink-0 rounded bg-teal-50 px-1.5 py-0.5 text-[11px] text-teal-800 dark:bg-teal-900/40 dark:text-teal-200">
            無料
          </span>
        )}
        {info && !info.tools && (
          <span className="shrink-0 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            ツール非対応
          </span>
        )}
        <ChevronsUpDown className="size-4 shrink-0 text-slate-500" />
      </button>
      <OpenRouterBrowser
        open={open}
        onClose={() => setOpen(false)}
        value={value}
        onSelect={onChange}
      />
    </>
  );
}

/**
 * value・onChange を渡さなければ、その接続先の「使うモデル」（cloudModels）を選ぶ。
 * 渡せば、別の設定（応答ごとの AI など）のモデルを選ぶ
 */
export function ModelPicker({
  provider,
  value,
  onChange,
}: {
  provider: CloudProviderId;
  value?: string;
  onChange?: (model: string) => void;
}) {
  const current = useSettings((s) => s.cloudModels[provider] ?? '');
  const model = value ?? current;
  const choose = onChange ?? ((m: string) => selectCloudModel(provider, m));
  const models = useCloud((s) => s.models[provider]);
  const checking = useCloud((s) => s.checking === provider);
  const refresh = useCloud((s) => s.refreshModels);
  const [manual, setManual] = useState(false);
  const [draft, setDraft] = useState(model);
  const label = CLOUD_PROVIDERS[provider].label;

  const commit = () => {
    const v = draft.trim();
    if (v && v !== model) choose(v);
  };
  const options = [
    ...models.map((m) => ({
      value: m.id,
      label: m.displayName === m.id ? m.id : `${m.displayName}（${m.id}）`,
    })),
    ...(model && !models.some((m) => m.id === model) ? [{ value: model, label: model }] : []),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {provider === 'openrouter' && !manual ? (
        <OpenRouterPicker value={model} onChange={choose} />
      ) : manual ? (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
          placeholder="モデル名"
          aria-label={`${label} のモデル名`}
          spellCheck={false}
          autoCapitalize="off"
          className="h-10 min-w-0 flex-1 basis-48 rounded-xl border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-900"
        />
      ) : options.length > 0 ? (
        <Select
          value={model}
          onChange={(v) => choose(v)}
          options={options}
          aria-label={`${label} のモデル`}
          className="min-w-0 flex-1 basis-48"
        />
      ) : (
        <span className="min-w-0 flex-1 basis-48 text-sm text-slate-500 dark:text-slate-400">
          {checking ? 'モデルの一覧を取得しています…' : 'モデルの一覧がありません'}
        </span>
      )}
      <Button
        size="icon"
        variant="secondary"
        onClick={() => {
          setDraft(model);
          setManual((m) => !m);
        }}
        aria-label={manual ? '一覧から選ぶ' : 'モデル名を直接入力'}
        title={manual ? '一覧から選ぶ' : 'モデル名を直接入力'}
      >
        {manual ? <List /> : <Pencil />}
      </Button>
      <Button
        size="icon"
        variant="secondary"
        onClick={() => void refresh(provider)}
        disabled={checking}
        aria-label="接続を確かめて、モデルの一覧を取り直す"
        title="接続を確かめて、モデルの一覧を取り直す"
      >
        <RefreshCw className={checking ? 'animate-spin' : undefined} />
      </Button>
    </div>
  );
}
