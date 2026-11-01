/**
 * 「AI モデル」画面の「AI の接続先」。会社（Gemini・OpenAI・Claude・OpenRouter）→ API キー（何本でも）→ モデルの順に管理する。
 * - アプリの合言葉・生体認証（VaultPanel）
 * - 接続先の選択: 端末内の AI と、登録した API キー
 * - API キーの追加（会社ごとに送る内容の説明と同意。キーは既定でアプリの合言葉で暗号化して保存）
 * - 選んだキーの詳細（名前・使うモデル・マイモデル・削除・安全の案内）
 * 考え方は docs/CLOUD_AI.md。
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import {
  Check,
  Cloud,
  Cpu,
  KeyRound,
  Lock,
  LockOpen,
  LogIn,
  Plus,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MIN_PASSPHRASE_LENGTH, type CloudKeyId, type CloudProviderId } from '@/lib/cloud/keyVault';
import { canLoginHere, startOpenRouterLogin } from '@/lib/cloud/openrouterAuth';
import { CLOUD_PROVIDERS } from '@/lib/cloud/providers';
import { cn } from '@/lib/utils/cn';
import { errorMessage } from '@/lib/utils/format';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings } from '@/features/settings/settingsStore';
import { keyLabel, useCloud, type KeyInfo, type SaveMode } from './cloudStore';
import { ExtLink } from './ExtLink';
import { ModelPicker } from './ModelPicker';
import { PROVIDERS, PROVIDER_IDS } from './providerInfo';
import { UnlockLegacyForm, VaultPanel } from './VaultForms';

const INPUT =
  'h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-950';

function Row({
  selected,
  onClick,
  icon,
  title,
  detail,
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  detail: string;
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
          : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50',
      )}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{title}</span>
        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{detail}</span>
      </span>
      {selected && <Check className="size-4 shrink-0 text-accent-600" />}
    </button>
  );
}

function keyDetail(k: KeyInfo, model: string | undefined): string {
  return [
    k.label ? CLOUD_PROVIDERS[k.provider].label : null,
    k.unlocked
      ? model
        ? CLOUD_PROVIDERS[k.provider].shortModel(model)
        : 'モデルを選んでください'
      : 'ロック中',
    k.stored ? `…${k.stored.hint}` : k.session ? '今回だけ' : null,
  ]
    .filter(Boolean)
    .join(' ・ ');
}

/** 接続先の選択（端末内の AI と、登録した API キー） */
function ConnectionList() {
  const aiProvider = useSettings((s) => s.aiProvider);
  const cloudModels = useSettings((s) => s.cloudModels);
  const update = useSettings((s) => s.update);
  const keys = useCloud((s) => s.keys);
  const engineStatus = useEngine((s) => s.status);
  const localModel = useEngine((s) => s.model);
  return (
    <div role="radiogroup" aria-label="AI の接続先" className="space-y-2">
      <Row
        selected={aiProvider === 'local'}
        onClick={() => update({ aiProvider: 'local' })}
        icon={<Cpu className="size-4" />}
        title="端末内の AI"
        detail={
          engineStatus === 'ready' && localModel
            ? localModel.name.replace(/\.litertlm$/, '')
            : 'ブラウザの中で動くモデル。内容は外に出ません'
        }
      />
      {keys.map((k) => (
        <Row
          key={k.id}
          selected={aiProvider === k.id}
          onClick={() => update({ aiProvider: k.id })}
          icon={k.unlocked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
          title={keyLabel(k)}
          detail={keyDetail(k, cloudModels[k.id])}
        />
      ))}
    </div>
  );
}

/** API キーの追加: 会社を選ぶ（はじめての会社は送る内容に同意）→ 名前・キー・保存のしかた */
function AddKeyForm({
  onDone,
  initialProvider,
}: {
  onDone: () => void;
  initialProvider?: CloudProviderId;
}) {
  const consents = useSettings((s) => s.cloudConsents);
  const update = useSettings((s) => s.update);
  const add = useCloud((s) => s.addKey);
  const addPending = useCloud((s) => s.addPendingKey);
  const pendingMap = useCloud((s) => s.pending);
  const checking = useCloud((s) => s.checking?.startsWith('new:') ?? false);
  const vault = useCloud((s) => s.vault);
  const [provider, setProvider] = useState<CloudProviderId | null>(
    initialProvider && consents[initialProvider] ? initialProvider : null,
  );
  const [askConsent, setAskConsent] = useState<CloudProviderId | null>(
    initialProvider && !consents[initialProvider] ? initialProvider : null,
  );
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [mode, setMode] = useState<'encrypted' | 'session'>('encrypted');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pending = provider ? pendingMap[provider] : false;

  const pick = (p: CloudProviderId) => {
    if (!consents[p]) setAskConsent(p);
    else setProvider(p);
  };

  const creating = vault === 'none';
  const passError =
    mode === 'encrypted' && creating && pass && pass.length < MIN_PASSPHRASE_LENGTH
      ? `合言葉は ${MIN_PASSPHRASE_LENGTH} 文字以上にしてください`
      : mode === 'encrypted' && creating && pass2 && pass !== pass2
        ? '確認用の合言葉が一致しません'
        : null;
  const passOk =
    mode === 'session' ||
    vault === 'open' ||
    (vault === 'locked' && !!pass) ||
    (creating && pass.length >= MIN_PASSPHRASE_LENGTH && pass === pass2);
  const canSubmit = !!provider && (pending || !!apiKey.trim()) && !checking && passOk;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !provider) return;
    setError(null);
    try {
      const save: SaveMode =
        mode === 'encrypted'
          ? { mode: 'vault', passphrase: pass || undefined }
          : { mode: 'session' };
      const id = pending
        ? await addPending(provider, save, label)
        : await add(provider, apiKey, save, label);
      update({ aiProvider: id });
      toast.success(`${label.trim() || PROVIDERS[provider].label} のキーを登録しました`);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-slate-500" />
        <h3 className="flex-1 text-sm font-semibold">API キーを追加</h3>
        <Button size="sm" variant="ghost" onClick={onDone}>
          やめる
        </Button>
      </div>
      <div role="radiogroup" aria-label="会社" className="grid gap-2 sm:grid-cols-2">
        {PROVIDER_IDS.map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={provider === p}
            onClick={() => pick(p)}
            className={cn(
              'rounded-xl border px-3 py-2 text-left transition-colors',
              provider === p
                ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30'
                : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50',
            )}
          >
            <span className="block text-sm font-medium">{PROVIDERS[p].label}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              {PROVIDERS[p].hint}
            </span>
          </button>
        ))}
      </div>
      {provider && (
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <label className="block space-y-1">
            <span className="text-sm font-medium">名前（任意）</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="例: 個人用・仕事用・無料用"
              maxLength={30}
              className={INPUT}
            />
          </label>
          {pending ? (
            <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              <ShieldCheck className="size-4 shrink-0" />
              {PROVIDERS[provider].company}{' '}
              からキーを受け取りました。保存のしかたを決めて登録してください。
            </p>
          ) : (
            <>
              {provider === 'openrouter' && canLoginHere() && (
                <div className="space-y-1.5">
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => void startOpenRouterLogin()}
                  >
                    <LogIn />
                    OpenRouter でログイン
                  </Button>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    OpenRouter
                    の画面でログインして許可すると、このアプリ用のキーが作られて戻ってきます（貼り付け不要）。または、下にキーを貼り付けてください。
                  </p>
                </div>
              )}
              <p className="text-sm text-slate-600 dark:text-slate-400">
                <ExtLink href={PROVIDERS[provider].keyPage.url}>
                  {PROVIDERS[provider].keyPage.name}
                </ExtLink>{' '}
                で API キーを作って貼り付けてください。
              </p>
              <label className="block space-y-1">
                <span className="text-sm font-medium">API キー</span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={PROVIDERS[provider].keyPlaceholder}
                  className={INPUT}
                />
              </label>
            </>
          )}
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">保存のしかた</legend>
            {(
              [
                [
                  'encrypted',
                  'アプリの合言葉で暗号化して、この端末に保存（おすすめ）',
                  '合言葉はすべての API キーで共通。合言葉か生体認証で 1 回解除すれば、すべてのキーが使えます',
                ],
                ['session', '今回だけ（保存しない）', 'タブを閉じると消えます'],
              ] as const
            ).map(([value, text, hint]) => (
              <label key={value} className="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="cloud-key-mode"
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="mt-1 accent-accent-600"
                />
                <span>
                  <span className="block text-sm">{text}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {mode === 'encrypted' && vault === 'open' && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              解除中のアプリの合言葉で暗号化します（入力は不要です）。
            </p>
          )}
          {mode === 'encrypted' && vault === 'locked' && (
            <label className="block space-y-1">
              <span className="text-sm font-medium">アプリの合言葉</span>
              <input
                type="password"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                autoComplete="current-password"
                className={INPUT}
              />
            </label>
          )}
          {mode === 'encrypted' && creating && (
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className="text-sm font-medium">
                  アプリの合言葉を決める（{MIN_PASSPHRASE_LENGTH} 文字以上）
                </span>
                <input
                  type="password"
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  autoComplete="new-password"
                  className={INPUT}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm font-medium">合言葉（確認）</span>
                <input
                  type="password"
                  value={pass2}
                  onChange={(e) => setPass2(e.target.value)}
                  autoComplete="new-password"
                  className={INPUT}
                />
              </label>
              <p className="text-xs text-slate-500 sm:col-span-2 dark:text-slate-400">
                ほかの API
                キーも、この合言葉で暗号化します。登録したあとに生体認証（指紋・顔認証など）も登録できます。合言葉は保存されません。
              </p>
            </div>
          )}
          {(passError || error) && (
            <p className="text-sm whitespace-pre-line text-rose-600 dark:text-rose-400">
              {error ?? passError}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={!canSubmit}>
            <KeyRound />
            {checking ? 'キーを確かめています…' : 'キーを確かめて登録'}
          </Button>
        </form>
      )}
      <ConfirmDialog
        open={askConsent !== null}
        title={askConsent ? `${PROVIDERS[askConsent].label} に送る内容について` : ''}
        description={
          askConsent && <div className="space-y-2 text-sm">{PROVIDERS[askConsent].consent}</div>
        }
        confirmLabel="同意して使う"
        onConfirm={() => {
          if (!askConsent) return;
          update({ cloudConsents: { ...consents, [askConsent]: true } });
          setProvider(askConsent);
          setAskConsent(null);
        }}
        onClose={() => setAskConsent(null)}
      />
    </div>
  );
}

function KeySafetyGuide({ provider }: { provider: CloudProviderId }) {
  return (
    <details className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
      <summary className="cursor-pointer font-medium">
        キーを安全に使うために（おすすめの設定）
      </summary>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        {PROVIDERS[provider].safety.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
        <li>共用のパソコンでは「今回だけ」を選ぶか、使い終わったらロックしてください。</li>
      </ul>
    </details>
  );
}

/** 選んだ API キーの詳細（名前・使うモデル・マイモデル・削除） */
function KeyPanel({ id }: { id: CloudKeyId }) {
  const k = useCloud((s) => s.keys.find((x) => x.id === id));
  const vault = useCloud((s) => s.vault);
  const modelsError = useCloud((s) => s.modelsError[id]);
  const rename = useCloud((s) => s.rename);
  const remove = useCloud((s) => s.remove);
  const [name, setName] = useState(k?.label ?? '');
  const [confirmRemove, setConfirmRemove] = useState(false);
  if (!k) return null;
  return (
    <div className="space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {PROVIDERS[k.provider].label}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() !== k.label && rename(k.id, name)}
          placeholder="名前（例: 個人用）"
          aria-label="キーの名前"
          maxLength={30}
          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-transparent px-2 text-sm font-medium dark:border-slate-700"
        />
      </div>
      {k.unlocked ? (
        <>
          <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
            <ShieldCheck className="size-4" />
            使える状態です
            {k.stored
              ? `（キー …${k.stored.hint}・暗号化して保存済み）`
              : '（今回だけ・保存していません）'}
          </p>
          <div className="space-y-1">
            <span className="text-sm font-medium">使うモデル</span>
            <ModelPicker keyId={k.id} />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              一覧で ★ を付けたモデル（マイモデル）は、ここや切り替えのシート・応答ごとの AI
              にすぐ出ます。
            </p>
          </div>
          {modelsError && (
            <p className="text-sm whitespace-pre-line text-rose-600 dark:text-rose-400">
              {modelsError}
            </p>
          )}
        </>
      ) : k.legacy && vault === 'open' ? (
        <UnlockLegacyForm id={k.id} />
      ) : (
        <p className="flex items-center gap-1.5 text-sm">
          <Lock className="size-4 shrink-0 text-amber-600" />
          キー（…{k.stored?.hint}）はロック中です。上の「アプリの合言葉」で解除すると使えます。
        </p>
      )}
      <KeySafetyGuide provider={k.provider} />
      <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
        <Trash2 />
        このキーを削除
      </Button>
      <ConfirmDialog
        open={confirmRemove}
        title={`「${keyLabel(k)}」のキーを削除しますか？`}
        description="この端末に保存した暗号化済みのキーと、使用中のキーを消します。このキーを使っていたところは、端末内の AI（またはいつもの AI）に戻ります。"
        confirmLabel="削除"
        danger
        onConfirm={() => {
          remove(k.id);
          setConfirmRemove(false);
          toast.success('API キーを削除しました');
        }}
        onClose={() => setConfirmRemove(false)}
      />
    </div>
  );
}

export function CloudSettings() {
  const aiProvider = useSettings((s) => s.aiProvider);
  const keys = useCloud((s) => s.keys);
  const pendingOpenRouter = useCloud((s) => s.pending.openrouter);
  const [adding, setAdding] = useState(false);
  const selected = aiProvider !== 'local' ? keys.find((k) => k.id === aiProvider) : undefined;
  const showAdd = adding || pendingOpenRouter;
  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
          <Cloud className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="font-semibold">AI の接続先</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            クラウド AI（Gemini・OpenAI・Claude・OpenRouter）の API
            キーを使うと、より詳しい解説やチャットができます。キーは会社ごとに何本でも登録でき（個人用・仕事用など）、キーごとに使うモデルを選べます。正誤の判定や学習記録はこれまでどおりアプリが行います。
          </p>
        </div>
      </div>
      <VaultPanel />
      <ConnectionList />
      {showAdd ? (
        <AddKeyForm
          onDone={() => setAdding(false)}
          initialProvider={pendingOpenRouter ? 'openrouter' : undefined}
        />
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus />
          API キーを追加
        </Button>
      )}
      {selected && <KeyPanel key={selected.id} id={selected.id} />}
    </Card>
  );
}
