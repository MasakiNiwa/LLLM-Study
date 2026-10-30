/**
 * アプリの合言葉（すべての AI のキーで共通）の解除・変更などの部品。
 * 「AI モデル」画面と、使う場面の切り替えのシートで使う。
 */
import { useState, type FormEvent } from 'react';
import { KeyRound, Lock, LockOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { MIN_PASSPHRASE_LENGTH, type CloudProviderId } from '@/lib/cloud/keyVault';
import { CLOUD_PROVIDERS } from '@/lib/cloud/providers';
import { errorMessage } from '@/lib/utils/format';
import { useCloud } from './cloudStore';

export const PASS_INPUT =
  'h-10 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-950';

function useSubmit(run: (pass: string) => Promise<void>) {
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pass) return;
    setBusy(true);
    setError(null);
    try {
      await run(pass);
      setPass('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { pass, setPass, busy, error, submit };
}

/** アプリの合言葉で、保存したすべてのキーを解除する */
export function UnlockVaultForm({ compact }: { compact?: boolean }) {
  const unlock = useCloud((s) => s.unlock);
  const f = useSubmit(async (pass) => {
    const opened = await unlock(pass);
    if (opened.length > 1)
      toast.success(
        `${opened.map((p) => CLOUD_PROVIDERS[p].label).join('・')} のキーを解除しました`,
      );
  });
  return (
    <form onSubmit={(e) => void f.submit(e)} className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-sm">
        <Lock className="size-4 shrink-0 text-amber-600" />
        {compact
          ? 'キーはロック中です。アプリの合言葉を入れると使えます。'
          : 'キーはロック中です。アプリの合言葉を入れると、保存したすべての AI のキーが使えます。'}
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          value={f.pass}
          onChange={(e) => f.setPass(e.target.value)}
          autoComplete="current-password"
          aria-label="アプリの合言葉"
          placeholder="アプリの合言葉"
          className={PASS_INPUT}
        />
        <Button type="submit" variant="primary" disabled={!f.pass || f.busy}>
          <LockOpen />
          {f.busy ? '解除中…' : '解除'}
        </Button>
      </div>
      {f.error && <p className="text-sm text-rose-600 dark:text-rose-400">{f.error}</p>}
    </form>
  );
}

/** 以前に別の合言葉で保存したキーを解除して、アプリの合言葉にそろえる */
export function UnlockLegacyForm({ provider }: { provider: CloudProviderId }) {
  const unlockLegacy = useCloud((s) => s.unlockLegacy);
  const f = useSubmit(async (pass) => {
    await unlockLegacy(provider, pass);
    toast.success(`${CLOUD_PROVIDERS[provider].label} のキーをアプリの合言葉にそろえました`);
  });
  return (
    <form onSubmit={(e) => void f.submit(e)} className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-sm">
        <Lock className="size-4 shrink-0 text-amber-600" />
        このキーは以前に別の合言葉で保存されています。その合言葉を入れると解除して、次からはアプリの合言葉だけで使えるようにします。
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          value={f.pass}
          onChange={(e) => f.setPass(e.target.value)}
          autoComplete="off"
          aria-label="以前の合言葉"
          placeholder="以前の合言葉"
          className={PASS_INPUT}
        />
        <Button type="submit" variant="primary" disabled={!f.pass || f.busy}>
          <LockOpen />
          {f.busy ? '解除中…' : '解除'}
        </Button>
      </div>
      {f.error && <p className="text-sm text-rose-600 dark:text-rose-400">{f.error}</p>}
    </form>
  );
}

/** アプリの合言葉の状態と操作（すべてロック・合言葉を変える・忘れたとき） */
export function VaultPanel() {
  const vault = useCloud((s) => s.vault);
  const lock = useCloud((s) => s.lock);
  const change = useCloud((s) => s.changePassphrase);
  const removeAll = useCloud((s) => s.removeAll);
  const [changing, setChanging] = useState(false);
  const [pass, setPass] = useState('');
  const [pass2, setPass2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  if (vault === 'none') return null;

  const passError =
    pass && pass.length < MIN_PASSPHRASE_LENGTH
      ? `合言葉は ${MIN_PASSPHRASE_LENGTH} 文字以上にしてください`
      : pass2 && pass !== pass2
        ? '確認用の合言葉が一致しません'
        : null;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (passError || !pass || pass !== pass2) return;
    setBusy(true);
    setError(null);
    try {
      await change(pass);
      setPass('');
      setPass2('');
      setChanging(false);
      toast.success('アプリの合言葉を変えました');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/50">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="size-4 text-slate-500" />
        <span className="min-w-0 flex-1 text-sm font-medium">
          アプリの合言葉（すべての AI のキーで共通）
        </span>
        {vault === 'open' && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setChanging((c) => !c)}>
              合言葉を変える
            </Button>
            <Button size="sm" variant="secondary" onClick={lock}>
              <Lock />
              すべてロック
            </Button>
          </>
        )}
      </div>
      {vault === 'locked' && (
        <>
          <UnlockVaultForm />
          <button
            type="button"
            onClick={() => setConfirmReset(true)}
            className="text-xs text-slate-500 underline dark:text-slate-400"
          >
            合言葉を忘れたとき
          </button>
        </>
      )}
      {vault === 'open' && changing && (
        <form onSubmit={(e) => void submit(e)} className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete="new-password"
              aria-label="新しい合言葉"
              placeholder={`新しい合言葉（${MIN_PASSPHRASE_LENGTH} 文字以上）`}
              className={PASS_INPUT}
            />
            <input
              type="password"
              value={pass2}
              onChange={(e) => setPass2(e.target.value)}
              autoComplete="new-password"
              aria-label="新しい合言葉（確認）"
              placeholder="新しい合言葉（確認）"
              className={PASS_INPUT}
            />
          </div>
          {(passError || error) && (
            <p className="text-sm text-rose-600 dark:text-rose-400">{error ?? passError}</p>
          )}
          <Button
            type="submit"
            size="sm"
            variant="primary"
            disabled={busy || !!passError || !pass || pass !== pass2}
          >
            {busy ? '暗号化し直しています…' : '保存したキーを新しい合言葉で暗号化し直す'}
          </Button>
        </form>
      )}
      <ConfirmDialog
        open={confirmReset}
        title="保存したキーをすべて削除しますか？"
        description="合言葉は保存していないので、忘れたときは元に戻せません。保存したすべての AI のキーとアプリの合言葉を消して、はじめから登録し直します。"
        confirmLabel="すべて削除"
        danger
        onConfirm={() => {
          removeAll();
          setConfirmReset(false);
          toast.success('保存したキーを削除しました。もう一度登録してください');
        }}
        onClose={() => setConfirmReset(false)}
      />
    </div>
  );
}
