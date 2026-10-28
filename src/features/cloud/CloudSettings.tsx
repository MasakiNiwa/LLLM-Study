/**
 * 「AI モデル」画面の「AI の接続先」: 端末内の AI / クラウド AI（Gemini・OpenAI・Claude・OpenRouter）の切り替え、
 * API キーの登録と解除、モデルの選択。キーは合言葉で暗号化してこの端末に保存するのが既定
 * （lib/cloud/keyVault.ts）。考え方は docs/CLOUD_AI.md。
 */
import { useState, type FormEvent } from 'react';
import { Cloud, KeyRound, Lock, LockOpen, LogIn, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MIN_PASSPHRASE_LENGTH, type CloudProviderId } from '@/lib/cloud/keyVault';
import { canLoginHere, startOpenRouterLogin } from '@/lib/cloud/openrouterAuth';
import { CLOUD_PROVIDERS } from '@/lib/cloud/providers';
import { cn } from '@/lib/utils/cn';
import { errorMessage } from '@/lib/utils/format';
import { useSettings, type AiProvider } from '@/features/settings/settingsStore';
import { useCloud } from './cloudStore';
import { ModelPicker } from './ModelPicker';
import { ExtLink } from './ExtLink';
import { PROVIDERS, PROVIDER_IDS } from './providerInfo';

const INPUT =
  'h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-950';

function ProviderChoice() {
  const provider = useSettings((s) => s.aiProvider);
  const consents = useSettings((s) => s.cloudConsents);
  const update = useSettings((s) => s.update);
  const [askConsent, setAskConsent] = useState<CloudProviderId | null>(null);

  const choose = (p: AiProvider) => {
    if (p !== 'local' && !consents[p]) {
      setAskConsent(p);
      return;
    }
    update({ aiProvider: p });
  };
  const options: { value: AiProvider; label: string; hint: string }[] = [
    { value: 'local', label: '端末内の AI', hint: 'ブラウザの中で動くモデル。内容は外に出ません' },
    ...PROVIDER_IDS.map((p) => ({ value: p, label: PROVIDERS[p].label, hint: PROVIDERS[p].hint })),
  ];
  return (
    <>
      <div role="radiogroup" aria-label="AI の接続先" className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={provider === o.value}
            onClick={() => choose(o.value)}
            className={cn(
              'rounded-xl border px-3 py-2.5 text-left transition-colors',
              provider === o.value
                ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30'
                : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50',
            )}
          >
            <span className="block font-medium">{o.label}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">{o.hint}</span>
          </button>
        ))}
      </div>
      <ConfirmDialog
        open={askConsent !== null}
        title={askConsent ? `${PROVIDERS[askConsent].label} に送る内容について` : ''}
        description={
          askConsent && <div className="space-y-2 text-sm">{PROVIDERS[askConsent].consent}</div>
        }
        confirmLabel="同意して使う"
        onConfirm={() => {
          if (!askConsent) return;
          update({
            cloudConsents: { ...consents, [askConsent]: true },
            aiProvider: askConsent,
          });
          setAskConsent(null);
        }}
        onClose={() => setAskConsent(null)}
      />
    </>
  );
}

function RegisterForm({ provider }: { provider: CloudProviderId }) {
  const info = PROVIDERS[provider];
  const register = useCloud((s) => s.register);
  const registerPending = useCloud((s) => s.registerPending);
  /** ログイン（OpenRouter）で受け取ったキーがある。貼り付けの代わりに、それを保存する */
  const pending = useCloud((s) => s.pending[provider]);
  const checking = useCloud((s) => s.checking === provider);
  const [apiKey, setApiKey] = useState('');
  const [mode, setMode] = useState<'encrypted' | 'session'>('encrypted');
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [error, setError] = useState<string | null>(null);

  const passError =
    mode === 'encrypted' && pass && pass.length < MIN_PASSPHRASE_LENGTH
      ? `合言葉は ${MIN_PASSPHRASE_LENGTH} 文字以上にしてください`
      : mode === 'encrypted' && pass2 && pass !== pass2
        ? '確認用の合言葉が一致しません'
        : null;
  const canSubmit =
    (pending || !!apiKey.trim()) &&
    !checking &&
    (mode === 'session' || (pass.length >= MIN_PASSPHRASE_LENGTH && pass === pass2));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      const passphrase = mode === 'encrypted' ? pass : null;
      if (pending) await registerPending(provider, passphrase);
      else await register(provider, apiKey, passphrase);
      setApiKey('');
      setPass('');
      setPass2('');
      toast.success(`${info.label} のキーを登録しました`);
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      {pending ? (
        <p className="flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <ShieldCheck className="size-4 shrink-0" />
          {info.company} からキーを受け取りました。保存のしかたを決めて登録してください。
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
            <ExtLink href={info.keyPage.url}>{info.keyPage.name}</ExtLink> で API
            キーを作って貼り付けてください。
          </p>
          <label className="block space-y-1">
            <span className="text-sm font-medium">API キー</span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              placeholder={info.keyPlaceholder}
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
              '合言葉で暗号化して、この端末に保存（おすすめ）',
              '次からは合言葉を入れるだけで使えます',
            ],
            ['session', '今回だけ（保存しない）', 'タブを閉じると消えます。毎回キーを貼り付けます'],
          ] as const
        ).map(([value, label, hint]) => (
          <label key={value} className="flex cursor-pointer items-start gap-2">
            <input
              type="radio"
              name={`cloud-key-mode-${provider}`}
              checked={mode === value}
              onChange={() => setMode(value)}
              className="mt-1 accent-accent-600"
            />
            <span>
              <span className="block text-sm">{label}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {mode === 'encrypted' && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-sm font-medium">合言葉（{MIN_PASSPHRASE_LENGTH} 文字以上）</span>
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
            合言葉は保存されません。忘れたときはキーを削除して登録し直してください。
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
  );
}

function UnlockForm({ provider }: { provider: CloudProviderId }) {
  const stored = useCloud((s) => s.stored[provider]);
  const unlock = useCloud((s) => s.unlock);
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pass) return;
    setBusy(true);
    setError(null);
    try {
      const also = await unlock(provider, pass);
      setPass('');
      if (also.length)
        toast.success(
          `同じ合言葉の ${also.map((p) => CLOUD_PROVIDERS[p].label).join('・')} のキーも解除しました`,
        );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-2">
      <p className="flex items-center gap-1.5 text-sm">
        <Lock className="size-4 text-amber-600" />
        キー（…{stored?.hint}）はロック中です。合言葉を入れると使えます。
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoComplete="current-password"
          aria-label="合言葉"
          placeholder="合言葉"
          className={INPUT}
        />
        <Button type="submit" variant="primary" disabled={!pass || busy}>
          <LockOpen />
          {busy ? '解除中…' : '解除'}
        </Button>
      </div>
      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
    </form>
  );
}

function UnlockedPanel({ provider }: { provider: CloudProviderId }) {
  const stored = useCloud((s) => s.stored[provider]);
  const modelsError = useCloud((s) => s.modelsError[provider]);
  const lock = useCloud((s) => s.lock);
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
        <ShieldCheck className="size-4" />
        使える状態です
        {stored ? `（キー …${stored.hint}・暗号化して保存済み）` : '（今回だけ・保存していません）'}
      </p>
      <div className="space-y-1">
        <span className="text-sm font-medium">使うモデル</span>
        <ModelPicker provider={provider} />
      </div>
      {modelsError && (
        <p className="text-sm whitespace-pre-line text-rose-600 dark:text-rose-400">
          {modelsError}
        </p>
      )}
      {stored && (
        <Button size="sm" variant="secondary" onClick={() => lock(provider)}>
          <Lock />
          ロックする
        </Button>
      )}
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

export function CloudSettings() {
  const aiProvider = useSettings((s) => s.aiProvider);
  const provider = aiProvider === 'local' ? null : aiProvider;
  const stored = useCloud((s) => (provider ? s.stored[provider] : null));
  const unlocked = useCloud((s) => (provider ? s.unlocked[provider] : false));
  const pending = useCloud((s) => (provider ? s.pending[provider] : false));
  const remove = useCloud((s) => s.remove);
  const [confirmRemove, setConfirmRemove] = useState(false);
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
            キーを使うと、より詳しい解説やチャットができます。
            正誤の判定や学習記録はこれまでどおりアプリが行います。
          </p>
        </div>
      </div>
      <ProviderChoice />
      {provider && (
        <div className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          {unlocked ? (
            <UnlockedPanel provider={provider} />
          ) : stored && !pending ? (
            <UnlockForm provider={provider} />
          ) : (
            <RegisterForm key={provider} provider={provider} />
          )}
          <KeySafetyGuide provider={provider} />
          {(stored || unlocked) && (
            <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(true)}>
              <Trash2 />
              キーを削除
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmRemove}
        title={provider ? `${PROVIDERS[provider].label} のキーを削除しますか？` : ''}
        description="この端末に保存した暗号化済みのキーと、使用中のキーを消します。AI の接続先は端末内の AI に戻ります。"
        confirmLabel="削除"
        danger
        onConfirm={() => {
          if (!provider) return;
          remove(provider);
          setConfirmRemove(false);
          toast.success('API キーを削除しました');
        }}
        onClose={() => setConfirmRemove(false)}
      />
    </Card>
  );
}
