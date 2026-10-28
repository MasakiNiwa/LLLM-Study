/**
 * クラウド AI の API キーの保管庫（ブラウザ内だけで完結する。サーバーには送らない）。
 *
 * - 既定は「合言葉で暗号化して、この端末に保存」。PBKDF2（SHA-256）で合言葉から鍵を作り、AES-GCM で暗号化する。
 *   保存するのは暗号文・ソルト・IV だけで、キーそのものも合言葉も保存しない
 * - 「今回だけ」を選ぶと、どこにも保存せずメモリーにだけ持つ（タブを閉じると消える）
 * - 解除したキーはこのモジュールの変数（メモリー）にだけ置く。状態管理（zustand）・設定・バックアップ・ログには入れない
 *
 * 注意: 同じページで悪意のあるスクリプトが動くと、解除中のキーは使われてしまう。
 * 暗号化は「保存中のデータ（端末・同じオリジンのほかのアプリ・書き出したファイル）から読まれない」ための対策で、
 * ページ自体の安全は CSP（送信先の限定）などで守る。考え方は docs/CLOUD_AI.md。
 */
import { STORAGE_PREFIX } from '@/lib/constants';

export type CloudProviderId = 'gemini' | 'openai' | 'anthropic' | 'openrouter';

/** 保存する形（暗号文とその復号に必要な公開してよい値だけ） */
interface StoredSecret {
  v: 1;
  /** PBKDF2 の繰り返し回数 */
  iterations: number;
  salt: string;
  iv: string;
  data: string;
  /** キーの末尾 4 文字（どのキーを保存したか見分けるため。全体は分からない） */
  hint: string;
  savedAt: number;
}

/** OWASP の推奨（PBKDF2-HMAC-SHA256）に合わせる */
export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 8;

const storageKey = (provider: CloudProviderId) => `${STORAGE_PREFIX}:cloud-key:${provider}`;

/** 解除済みのキー（メモリーにだけ置く） */
const unlocked = new Map<CloudProviderId, string>();
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** 解除・ロック・保存・削除のたびに呼ばれる（画面の表示を更新するため） */
export function subscribeVault(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(passphrase: string, salt: Uint8Array, iterations: number) {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function readStored(provider: CloudProviderId): StoredSecret | null {
  try {
    const raw = localStorage.getItem(storageKey(provider));
    if (!raw) return null;
    const s = JSON.parse(raw) as StoredSecret;
    return s && s.v === 1 && s.data ? s : null;
  } catch {
    return null;
  }
}

export function keyHint(key: string): string {
  return key.trim().slice(-4);
}

/** 暗号化して保存したキーがあるか（解除しなくても分かる） */
export function storedKeyInfo(provider: CloudProviderId): { hint: string; savedAt: number } | null {
  const s = readStored(provider);
  return s ? { hint: s.hint, savedAt: s.savedAt } : null;
}

export function isUnlocked(provider: CloudProviderId): boolean {
  return unlocked.has(provider);
}

/** 解除済みのキー。ロック中なら null（呼び出し側でキーを画面や記録に出さないこと） */
export function getUnlockedKey(provider: CloudProviderId): string | null {
  return unlocked.get(provider) ?? null;
}

/**
 * キーを登録する。passphrase があれば暗号化してこの端末に保存し、なければ（今回だけ）メモリーにだけ持つ。
 * どちらの場合も、登録したキーはすぐに使える（解除済み）
 */
export async function saveKey(
  provider: CloudProviderId,
  apiKey: string,
  passphrase: string | null,
  iterations = PBKDF2_ITERATIONS,
): Promise<void> {
  const key = apiKey.trim();
  if (!key) throw new Error('API キーを入力してください');
  if (passphrase !== null) {
    if (passphrase.length < MIN_PASSPHRASE_LENGTH)
      throw new Error(`合言葉は ${MIN_PASSPHRASE_LENGTH} 文字以上にしてください`);
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const aes = await deriveKey(passphrase, salt, iterations);
    const data = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv as BufferSource },
      aes,
      new TextEncoder().encode(key),
    );
    const stored: StoredSecret = {
      v: 1,
      iterations,
      salt: toB64(salt),
      iv: toB64(iv),
      data: toB64(data),
      hint: keyHint(key),
      savedAt: Date.now(),
    };
    localStorage.setItem(storageKey(provider), JSON.stringify(stored));
  } else {
    // 今回だけ: 以前に暗号化して保存したキーは残さない（どちらのキーを使っているか分からなくなるため）
    localStorage.removeItem(storageKey(provider));
  }
  unlocked.set(provider, key);
  emit();
}

/** 合言葉で解除する。合言葉が違えば例外 */
export async function unlockKey(provider: CloudProviderId, passphrase: string): Promise<void> {
  const s = readStored(provider);
  if (!s) throw new Error('保存したキーがありません');
  let plain: ArrayBuffer;
  try {
    const aes = await deriveKey(passphrase, fromB64(s.salt), s.iterations);
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(s.iv) as BufferSource },
      aes,
      fromB64(s.data) as BufferSource,
    );
  } catch {
    throw new Error('合言葉が違います');
  }
  unlocked.set(provider, new TextDecoder().decode(plain));
  emit();
}

/** ロックする（メモリーから消す。保存した暗号文は残る） */
export function lockKey(provider: CloudProviderId): void {
  if (unlocked.delete(provider)) emit();
}

/** 保存したキーとメモリーのキーをどちらも消す */
export function deleteKey(provider: CloudProviderId): void {
  localStorage.removeItem(storageKey(provider));
  unlocked.delete(provider);
  emit();
}

/**
 * ログイン（OpenRouter の OAuth）で受け取った、まだ保存していないキー。
 * 合言葉を決めて保存するまでのあいだ、メモリーにだけ置く（画面にもストアにも出さない）
 */
const pending = new Map<CloudProviderId, string>();

export function holdPendingKey(provider: CloudProviderId, key: string): void {
  pending.set(provider, key);
  emit();
}

export function hasPendingKey(provider: CloudProviderId): boolean {
  return pending.has(provider);
}

/** 受け取ったキーを取り出す（取り出したら消える） */
export function takePendingKey(provider: CloudProviderId): string | null {
  const key = pending.get(provider) ?? null;
  pending.delete(provider);
  emit();
  return key;
}
