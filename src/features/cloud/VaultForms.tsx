/**
 * アプリの合言葉（すべての API キーで共通）と生体認証（パスキー）の部品。
 * 「AI モデル」画面と、使う場面の切り替えのシートで使う。
 */
import { useState, type FormEvent } from 'react';
import { Fingerprint, KeyRound, Lock, LockOpen } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Select } from '@/components/ui/Select';
import { MIN_PASSPHRASE_LENGTH, passkeySupported, type CloudKeyId } from '@/lib/cloud/keyVault';
import { errorMessage } from '@/lib/utils/format';
import { useSettings } from '@/features/settings/settingsStore';
import { keyLabel, useCloud } from './cloudStore';

export const PASS_INPUT =
  'h-10 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-950';

function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run };
}

function opened(ids: CloudKeyId[]) {
  const keys = useCloud.getState().keys;
  if (ids.length > 1)
    toast.success(
      `${ids.map((id) => keyLabel(keys.find((k) => k.id === id) ?? { label: id, provider: 'gemini' })).join('・')} のキーを解除しました`,
    );
}

/** 生体認証で解除するボタン（登録済みのときだけ） */
export function PasskeyUnlockButton({ className }: { className?: string }) {
  const passkey = useCloud((s) => s.passkey);
  const unlock = useCloud((s) => s.unlockWithPasskey);
  const a = useAction();
  if (!passkey || !passkeySupported()) return null;
  return (
    <div className={className}>
      <Button
        variant="primary"
        className="w-full"
        disabled={a.busy}
        onClick={() => void a.run(async () => opened(await unlock()))}
      >
        <Fingerprint />
        {a.busy ? '確認しています…' : '生体認証で解除'}
      </Button>
      {a.error && <p className="mt-1 text-sm text-rose-600 dark:text-rose-400">{a.error}</p>}
    </div>
  );
}

/** アプリの合言葉（または生体認証）で、保存したすべてのキーを解除する */
export function UnlockVaultForm({ compact }: { compact?: boolean }) {
  const unlock = useCloud((s) => s.unlock);
  const [pass, setPass] = useState('');
  const a = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pass) return;
    if (await a.run(async () => opened(await unlock(pass)))) setPass('');
  };
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-sm">
        <Lock className="size-4 shrink-0 text-amber-600" />
        {compact
          ? 'キーはロック中です。解除すると使えます。'
          : 'キーはロック中です。解除すると、保存したすべての API キーが使えます。'}
      </p>
      <PasskeyUnlockButton />
      <form onSubmit={(e) => void submit(e)} className="space-y-1.5">
        <div className="flex gap-2">
          <input
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            autoComplete="current-password"
            aria-label="アプリの合言葉"
            placeholder="アプリの合言葉"
            className={PASS_INPUT}
          />
          <Button type="submit" variant="secondary" disabled={!pass || a.busy}>
            <LockOpen />
            {a.busy ? '解除中…' : '解除'}
          </Button>
        </div>
        {a.error && <p className="text-sm text-rose-600 dark:text-rose-400">{a.error}</p>}
      </form>
    </div>
  );
}

/** 以前に別の合言葉で保存したキーを解除して、アプリの合言葉にそろえる */
export function UnlockLegacyForm({ id }: { id: CloudKeyId }) {
  const unlockLegacy = useCloud((s) => s.unlockLegacy);
  const [pass, setPass] = useState('');
  const a = useAction();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!pass) return;
    if (
      await a.run(async () => {
        await unlockLegacy(id, pass);
        toast.success('キーをアプリの合言葉にそろえました');
      })
    )
      setPass('');
  };
  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-sm">
        <Lock className="size-4 shrink-0 text-amber-600" />
        このキーは以前に別の合言葉で保存されています。その合言葉を入れると解除して、次からはアプリの合言葉だけで使えるようにします。
      </p>
      <div className="flex gap-2">
        <input
          type="password"
          value={pass}
          onChange={(e) => setPass(e.target.value)}
          autoComplete="off"
          aria-label="以前の合言葉"
          placeholder="以前の合言葉"
          className={PASS_INPUT}
        />
        <Button type="submit" variant="primary" disabled={!pass || a.busy}>
          <LockOpen />
          {a.busy ? '解除中…' : '解除'}
        </Button>
      </div>
      {a.error && <p className="text-sm text-rose-600 dark:text-rose-400">{a.error}</p>}
    </form>
  );
}

const AUTO_LOCK_OPTIONS = [
  { value: '15', label: '15 分' },
  { value: '60', label: '1 時間' },
  { value: '240', label: '4 時間' },
  { value: '0', label: 'しない' },
];

/** 合言葉の確かめ（生体認証の登録・合言葉の変更のときに入れてもらう） */
function PassphraseAction({
  label,
  busyLabel,
  withNew,
  onSubmit,
  onCancel,
}: {
  label: string;
  busyLabel: string;
  withNew?: boolean;
  onSubmit: (current: string, next: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [next2, setNext2] = useState('');
  const a = useAction();
  const nextError = !withNew
    ? null
    : next && next.length < MIN_PASSPHRASE_LENGTH
      ? `合言葉は ${MIN_PASSPHRASE_LENGTH} 文字以上にしてください`
      : next2 && next !== next2
        ? '確認用の合言葉が一致しません'
        : null;
  const ok = !!current && (!withNew || (next.length >= MIN_PASSPHRASE_LENGTH && next === next2));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) void a.run(() => onSubmit(current, next));
      }}
      className="space-y-2"
    >
      <input
        type="password"
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        autoComplete="current-password"
        aria-label="今の合言葉"
        placeholder="今の合言葉"
        className={PASS_INPUT}
      />
      {withNew && (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            aria-label="新しい合言葉"
            placeholder={`新しい合言葉（${MIN_PASSPHRASE_LENGTH} 文字以上）`}
            className={PASS_INPUT}
          />
          <input
            type="password"
            value={next2}
            onChange={(e) => setNext2(e.target.value)}
            autoComplete="new-password"
            aria-label="新しい合言葉（確認）"
            placeholder="新しい合言葉（確認）"
            className={PASS_INPUT}
          />
        </div>
      )}
      {(nextError || a.error) && (
        <p className="text-sm text-rose-600 dark:text-rose-400">{a.error ?? nextError}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={a.busy || !ok}>
          {a.busy ? busyLabel : label}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          やめる
        </Button>
      </div>
    </form>
  );
}

/** アプリの合言葉・生体認証・自動ロックの状態と操作 */
export function VaultPanel() {
  const vault = useCloud((s) => s.vault);
  const passkey = useCloud((s) => s.passkey);
  const lock = useCloud((s) => s.lock);
  const change = useCloud((s) => s.changePassphrase);
  const registerPasskey = useCloud((s) => s.registerPasskey);
  const removePasskey = useCloud((s) => s.removePasskey);
  const removeAll = useCloud((s) => s.removeAll);
  const autoLock = useSettings((s) => s.vaultAutoLockMinutes);
  const update = useSettings((s) => s.update);
  const [action, setAction] = useState<'change' | 'passkey' | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmRemovePasskey, setConfirmRemovePasskey] = useState(false);
  if (vault === 'none') return null;

  return (
    <div className="space-y-3 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/50">
      <div className="flex flex-wrap items-center gap-2">
        <KeyRound className="size-4 text-slate-500" />
        <span className="min-w-0 flex-1 text-sm font-medium">
          アプリの合言葉（すべての API キーで共通）
        </span>
        {vault === 'open' && (
          <Button size="sm" variant="secondary" onClick={lock}>
            <Lock />
            すべてロック
          </Button>
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
      {vault === 'open' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Fingerprint className="size-4 text-slate-500" />
            <span className="min-w-0 flex-1">
              生体認証（指紋・顔認証など）:{' '}
              {passkey ? (
                <span className="text-emerald-700 dark:text-emerald-300">登録済み</span>
              ) : (
                <span className="text-slate-500">未登録</span>
              )}
            </span>
            {passkeySupported() &&
              (passkey ? (
                <Button size="sm" variant="ghost" onClick={() => setConfirmRemovePasskey(true)}>
                  登録を消す
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setAction('passkey')}>
                  <Fingerprint />
                  登録する
                </Button>
              ))}
          </div>
          {!passkeySupported() && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              このブラウザはパスキー（生体認証）に対応していません。
            </p>
          )}
          {action === 'passkey' && (
            <div className="space-y-1.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                確認のため、今の合言葉を入れてください。この端末のこのブラウザで、指紋・顔認証などで解除できるようになります（合言葉での解除もそのまま使えます）。
              </p>
              <PassphraseAction
                label="生体認証を登録"
                busyLabel="登録しています…"
                onSubmit={async (current) => {
                  await registerPasskey(current);
                  setAction(null);
                  toast.success('生体認証を登録しました。次からは指紋・顔認証などで解除できます');
                }}
                onCancel={() => setAction(null)}
              />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="min-w-0 flex-1">使わない時間が続いたら自動でロック</span>
            <Select
              value={String(autoLock)}
              onChange={(v) => update({ vaultAutoLockMinutes: Number(v) })}
              options={AUTO_LOCK_OPTIONS}
              aria-label="自動でロックするまでの時間"
              className="w-28"
            />
          </div>
          {action === 'change' ? (
            <PassphraseAction
              withNew
              label="合言葉を変える"
              busyLabel="変えています…"
              onSubmit={async (current, next) => {
                await change(current, next);
                setAction(null);
                toast.success('アプリの合言葉を変えました');
              }}
              onCancel={() => setAction(null)}
            />
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setAction('change')}>
              合言葉を変える
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmReset}
        title="保存したキーをすべて削除しますか？"
        description="合言葉は保存していないので、忘れたときは元に戻せません。保存したすべての API キーとアプリの合言葉（生体認証の登録も）を消して、はじめから登録し直します。"
        confirmLabel="すべて削除"
        danger
        onConfirm={() => {
          removeAll();
          setConfirmReset(false);
          toast.success('保存したキーを削除しました。もう一度登録してください');
        }}
        onClose={() => setConfirmReset(false)}
      />
      <ConfirmDialog
        open={confirmRemovePasskey}
        title="生体認証の登録を消しますか？"
        description="合言葉での解除はそのまま使えます。パスキーそのものは、端末のパスワード管理の画面から削除できます。"
        confirmLabel="登録を消す"
        onConfirm={() => {
          removePasskey();
          setConfirmRemovePasskey(false);
        }}
        onClose={() => setConfirmRemovePasskey(false)}
      />
    </div>
  );
}
