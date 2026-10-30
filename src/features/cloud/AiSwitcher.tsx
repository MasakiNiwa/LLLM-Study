/**
 * 使う場面で AI を切り替えるシート（モデルの状態のチップを押すと開く）。
 * 接続先（端末内・キーを登録したクラウド AI）とモデルをその場で選べる。ロック中のキーはここでアプリの合言葉を入れて解除できる。
 * キーの登録・削除などの詳しい設定は「AI モデル」画面で行う。
 */
import type { ReactNode } from 'react';
import { Check, ChevronRight, Cpu, Lock, LockOpen } from 'lucide-react';
import { Link } from 'wouter';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useSheetClose } from '@/components/ui/sheetContext';
import type { CloudProviderId } from '@/lib/cloud/keyVault';
import { CLOUD_PROVIDERS, CLOUD_PROVIDER_IDS } from '@/lib/cloud/providers';
import { cn } from '@/lib/utils/cn';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings, type AiProvider } from '@/features/settings/settingsStore';
import { parseRecent, selectCloudModel, useCloud } from './cloudStore';
import { ModelPicker } from './ModelPicker';
import { UnlockLegacyForm, UnlockVaultForm } from './VaultForms';

function OptionRow({
  selected,
  onClick,
  title,
  detail,
  icon,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  detail: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
        selected
          ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30'
          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50',
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium">{title}</span>
        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{detail}</span>
      </span>
      {selected && <Check className="size-4 shrink-0 text-accent-600" />}
    </button>
  );
}

function AiSwitcherBody() {
  const close = useSheetClose();
  const aiProvider = useSettings((s) => s.aiProvider);
  const cloudModels = useSettings((s) => s.cloudModels);
  const consents = useSettings((s) => s.cloudConsents);
  const recents = useSettings((s) => s.recentCloudModels);
  const update = useSettings((s) => s.update);
  const stored = useCloud((s) => s.stored);
  const unlocked = useCloud((s) => s.unlocked);
  const legacy = useCloud((s) => s.legacy);
  const vault = useCloud((s) => s.vault);
  const engineStatus = useEngine((s) => s.status);
  const localModel = useEngine((s) => s.model);

  /** キーを登録した（または今回だけ使っている）接続先 */
  const available = CLOUD_PROVIDER_IDS.filter((p) => (stored[p] || unlocked[p]) && consents[p]);
  const others = CLOUD_PROVIDER_IDS.filter((p) => !available.includes(p));
  const choose = (p: AiProvider) => update({ aiProvider: p });
  const cloud = aiProvider === 'local' ? null : aiProvider;
  const recentList = recents
    .map(parseRecent)
    .filter((r) => r && available.includes(r.provider))
    .filter((r) => !(r!.provider === cloud && cloudModels[r!.provider] === r!.model))
    .slice(0, 4) as { provider: CloudProviderId; model: string }[];

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="使う AI" className="space-y-2">
        <OptionRow
          selected={aiProvider === 'local'}
          onClick={() => choose('local')}
          title="端末内の AI"
          detail={
            engineStatus === 'ready' && localModel
              ? localModel.name.replace(/\.litertlm$/, '')
              : 'モデルを読み込むと使えます（内容は外に出ません）'
          }
          icon={<Cpu className="size-4" />}
        />
        {available.map((p) => {
          const model = cloudModels[p];
          return (
            <OptionRow
              key={p}
              selected={aiProvider === p}
              onClick={() => choose(p)}
              title={CLOUD_PROVIDERS[p].label}
              detail={
                unlocked[p]
                  ? model
                    ? CLOUD_PROVIDERS[p].shortModel(model)
                    : 'モデルを選んでください'
                  : 'ロック中（合言葉で解除）'
              }
              icon={unlocked[p] ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
            />
          );
        })}
      </div>

      {cloud && available.includes(cloud) && (
        <div className="space-y-2 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/50">
          {unlocked[cloud] ? (
            <>
              <span className="text-sm font-medium">{CLOUD_PROVIDERS[cloud].label} のモデル</span>
              <ModelPicker provider={cloud} />
            </>
          ) : legacy[cloud] && vault === 'open' ? (
            <UnlockLegacyForm provider={cloud} />
          ) : (
            <UnlockVaultForm compact />
          )}
        </div>
      )}

      {recentList.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            最近使ったモデル
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {recentList.map((r) => (
              <button
                key={`${r.provider}|${r.model}`}
                type="button"
                onClick={() => {
                  selectCloudModel(r.provider, r.model);
                  choose(r.provider);
                }}
                className="max-w-full truncate rounded-xl border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                {CLOUD_PROVIDERS[r.provider].label} ·{' '}
                {CLOUD_PROVIDERS[r.provider].shortModel(r.model)}
              </button>
            ))}
          </div>
        </div>
      )}

      {others.length > 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {others.map((p) => CLOUD_PROVIDERS[p].label).join('・')} は、「AI モデル」画面で API
          キーを登録すると、ここで選べるようになります。
        </p>
      )}
      <Link
        href="/models"
        onClick={close}
        className="flex items-center justify-center gap-1 py-1 text-sm font-medium text-accent-700 dark:text-accent-300"
      >
        AI モデルの画面で詳しく設定する
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}

export function AiSwitcher({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <BottomSheet open={open} onClose={onClose} title="使う AI を選ぶ" expandable>
      <AiSwitcherBody />
    </BottomSheet>
  );
}
