/**
 * 「AI モデル」画面の「クラウド AI（Gemini API）」: 接続先の切り替え・API キーの登録と解除・モデルの選択。
 * キーは合言葉で暗号化してこの端末に保存するのが既定（lib/cloud/keyVault.ts）。考え方は docs/CLOUD_AI.md。
 */
import { useState, type FormEvent, type ReactNode } from 'react';
import { Cloud, KeyRound, Lock, LockOpen, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Select } from '@/components/ui/Select';
import { MIN_PASSPHRASE_LENGTH } from '@/lib/cloud/keyVault';
import { cn } from '@/lib/utils/cn';
import { errorMessage } from '@/lib/utils/format';
import { useSettings, type AiProvider } from '@/features/settings/settingsStore';
import { useCloud } from './cloudStore';

const AI_STUDIO_KEY_URL = 'https://aistudio.google.com/apikey';

const INPUT =
  'h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-950';

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-700 underline dark:text-accent-300"
    >
      {children}
    </a>
  );
}

/** クラウド AI に送る内容の説明（はじめて Gemini を選ぶときに同意してもらう） */
function ConsentText() {
  return (
    <div className="space-y-2 text-sm">
      <p>
        Gemini API を使うと、AI に頼んだ内容（カードの問題と答え・あなたの答え・チャットの文章・
        学習の状況）が Google に送られます。
      </p>
      <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>
          無料枠では、送った内容が Google のサービスの改善に使われ、人が読むこともあります。
        </strong>
        個人情報や社外秘の内容は送らないでください。
      </p>
      <p>
        API キーは合言葉で暗号化してこの端末にだけ保存し、Google 以外には送りません。
        学習記録・教材はこれまでどおり端末内に保存されます。
      </p>
    </div>
  );
}

function ProviderChoice() {
  const provider = useSettings((s) => s.aiProvider);
  const consent = useSettings((s) => s.cloudConsent);
  const update = useSettings((s) => s.update);
  const [askConsent, setAskConsent] = useState(false);

  const choose = (p: AiProvider) => {
    if (p === 'gemini' && !consent) {
      setAskConsent(true);
      return;
    }
    update({ aiProvider: p });
  };
  const options: { value: AiProvider; label: string; hint: string }[] = [
    { value: 'local', label: '端末内の AI', hint: 'ブラウザの中で動くモデル。内容は外に出ません' },
    { value: 'gemini', label: 'Gemini API', hint: 'Google のクラウド AI。詳しく解説してくれます' },
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
        open={askConsent}
        title="Gemini API に送る内容について"
        description={<ConsentText />}
        confirmLabel="同意して使う"
        onConfirm={() => {
          update({ cloudConsent: true, aiProvider: 'gemini' });
          setAskConsent(false);
        }}
        onClose={() => setAskConsent(false)}
      />
    </>
  );
}

function RegisterForm() {
  const register = useCloud((s) => s.register);
  const checking = useCloud((s) => s.checking);
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
    !!apiKey.trim() &&
    !checking &&
    (mode === 'session' || (pass.length >= MIN_PASSPHRASE_LENGTH && pass === pass2));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    try {
      await register(apiKey, mode === 'encrypted' ? pass : null);
      setApiKey('');
      setPass('');
      setPass2('');
      toast.success('API キーを登録しました');
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        <ExtLink href={AI_STUDIO_KEY_URL}>Google AI Studio</ExtLink> で API
        キーを作って貼り付けてください（無料枠で使えます）。
      </p>
      <label className="block space-y-1">
        <span className="text-sm font-medium">API キー</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="AIza…"
          className={INPUT}
        />
      </label>
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
              name="cloud-key-mode"
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

function UnlockForm() {
  const stored = useCloud((s) => s.stored);
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
      await unlock(pass);
      setPass('');
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

function UnlockedPanel() {
  const stored = useCloud((s) => s.stored);
  const models = useCloud((s) => s.models);
  const modelsError = useCloud((s) => s.modelsError);
  const checking = useCloud((s) => s.checking);
  const refresh = useCloud((s) => s.refreshModels);
  const lock = useCloud((s) => s.lock);
  const model = useSettings((s) => s.geminiModel);
  const update = useSettings((s) => s.update);
  const options = models.length
    ? models.map((m) => ({ value: m.id, label: m.displayName }))
    : model
      ? [{ value: model, label: model }]
      : [];
  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-300">
        <ShieldCheck className="size-4" />
        使える状態です
        {stored ? `（キー …${stored.hint}・暗号化して保存済み）` : '（今回だけ・保存していません）'}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">モデル</span>
        {options.length > 0 && (
          <Select
            value={model}
            onChange={(v) => update({ geminiModel: v })}
            options={options}
            aria-label="Gemini のモデル"
            className="min-w-0 flex-1 basis-48"
          />
        )}
        <Button size="sm" variant="ghost" onClick={() => void refresh()} disabled={checking}>
          <RefreshCw className={checking ? 'animate-spin' : undefined} />
          接続を確かめる
        </Button>
      </div>
      {modelsError && (
        <p className="text-sm whitespace-pre-line text-rose-600 dark:text-rose-400">
          {modelsError}
        </p>
      )}
      {stored && (
        <Button size="sm" variant="secondary" onClick={lock}>
          <Lock />
          ロックする
        </Button>
      )}
    </div>
  );
}

/** キーの漏れに備える設定（Google Cloud の画面で行う） */
function KeySafetyGuide() {
  return (
    <details className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
      <summary className="cursor-pointer font-medium">
        キーを安全に使うために（おすすめの設定）
      </summary>
      <ul className="mt-2 list-disc space-y-1.5 pl-5">
        <li>このアプリ専用のキーを作り、ほかの用途と使い回さないでください。</li>
        <li>
          <ExtLink href="https://console.cloud.google.com/apis/credentials">
            Google Cloud の「認証情報」
          </ExtLink>
          でキーを開き、「アプリケーションの制限」を「ウェブサイト」にして{' '}
          <code className="rounded bg-white px-1 dark:bg-slate-900">
            https://masakiniwa.github.io/*
          </code>{' '}
          を追加し、「API の制限」で Generative Language API
          だけを許可すると、キーが漏れても他のサイトからは使えません。
        </li>
        <li>
          AI Studio で作ったキーは Google Cloud のプロジェクトの中にあります。Google Cloud
          の画面にキーが出ないときは、AI Studio
          でそのプロジェクトを読み込む（インポートする）と、制限を設定できるようになります。請求先（課金）を設定しなければ無料枠のまま使えます。制限をかけなくてもアプリは使えます。
        </li>
        <li>心配なときは、いつでもキーを削除（AI Studio で無効化）して作り直せます。</li>
        <li>共用のパソコンでは「今回だけ」を選ぶか、使い終わったらロックしてください。</li>
      </ul>
    </details>
  );
}

export function CloudSettings() {
  const provider = useSettings((s) => s.aiProvider);
  const stored = useCloud((s) => s.stored);
  const unlocked = useCloud((s) => s.unlocked);
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
            クラウド AI（Gemini API）の API キーを使うと、より詳しい解説やチャットができます。
            正誤の判定や学習記録はこれまでどおりアプリが行います。
          </p>
        </div>
      </div>
      <ProviderChoice />
      {provider === 'gemini' && (
        <div className="space-y-4 border-t border-slate-100 pt-4 dark:border-slate-800">
          {unlocked ? <UnlockedPanel /> : stored ? <UnlockForm /> : <RegisterForm />}
          <KeySafetyGuide />
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
        title="API キーを削除しますか？"
        description="この端末に保存した暗号化済みのキーと、使用中のキーを消します。AI の接続先は端末内の AI に戻ります。"
        confirmLabel="削除"
        danger
        onConfirm={() => {
          remove();
          setConfirmRemove(false);
          toast.success('API キーを削除しました');
        }}
        onClose={() => setConfirmRemove(false)}
      />
    </Card>
  );
}
