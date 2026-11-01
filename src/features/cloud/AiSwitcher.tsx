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
import { CLOUD_PROVIDERS } from '@/lib/cloud/providers';
import { cn } from '@/lib/utils/cn';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings, type AiProvider } from '@/features/settings/settingsStore';
import { keyLabel, parseRecent, selectCloudModel, useCloud } from './cloudStore';
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
  const recents = useSettings((s) => s.recentCloudModels);
  const update = useSettings((s) => s.update);
  const keys = useCloud((s) => s.keys);
  const vault = useCloud((s) => s.vault);
  const engineStatus = useEngine((s) => s.status);
  const localModel = useEngine((s) => s.model);

  const choose = (p: AiProvider) => update({ aiProvider: p });
  const cloud = aiProvider === 'local' ? undefined : keys.find((k) => k.id === aiProvider);
  const recentList = recents
    .map(parseRecent)
    .filter((r): r is { id: string; model: string } => !!r)
    .filter((r) => !(r.id === cloud?.id && cloudModels[r.id] === r.model))
    .slice(0, 4);
  const keyOf = (id: string) => keys.find((k) => k.id === id);

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
        {keys.map((k) => {
          const model = cloudModels[k.id];
          return (
            <OptionRow
              key={k.id}
              selected={aiProvider === k.id}
              onClick={() => choose(k.id)}
              title={keyLabel(k)}
              detail={[
                k.label ? CLOUD_PROVIDERS[k.provider].label : null,
                k.unlocked
                  ? model
                    ? CLOUD_PROVIDERS[k.provider].shortModel(model)
                    : 'モデルを選んでください'
                  : 'ロック中',
              ]
                .filter(Boolean)
                .join(' ・ ')}
              icon={k.unlocked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
            />
          );
        })}
      </div>

      {cloud && (
        <div className="space-y-2 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/50">
          {cloud.unlocked ? (
            <>
              <span className="text-sm font-medium">{keyLabel(cloud)} のモデル</span>
              <ModelPicker keyId={cloud.id} />
            </>
          ) : cloud.legacy && vault === 'open' ? (
            <UnlockLegacyForm id={cloud.id} />
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
            {recentList.map((r) => {
              const k = keyOf(r.id)!;
              return (
                <button
                  key={`${r.id}|${r.model}`}
                  type="button"
                  onClick={() => {
                    selectCloudModel(r.id, r.model);
                    choose(r.id);
                  }}
                  className="max-w-full truncate rounded-xl border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                >
                  {keyLabel(k)} · {CLOUD_PROVIDERS[k.provider].shortModel(r.model)}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {keys.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Gemini・OpenAI・Claude・OpenRouter は、「AI モデル」画面で API
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
