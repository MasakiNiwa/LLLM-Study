/**
 * クラウド AI の API キーの保管庫（ブラウザ内だけで完結する。サーバーには送らない）。
 *
 * - 既定は「アプリの合言葉で暗号化して、この端末に保存」。合言葉は 1 つで、すべての接続先のキーに共通
 *   - PBKDF2（SHA-256）で合言葉から AES-GCM の鍵を作り、各キーを暗号化する。保存するのは暗号文・ソルト・IV と
 *     「合言葉が合っているかを確かめるための暗号文」だけで、キーそのものも合言葉も保存しない
 *   - 合言葉を入れると、保存したすべてのキーが使える（解除）。メモリーには取り出せない形の鍵（CryptoKey）を置き、
 *     合言葉の文字列は持たない。新しく登録するキーは、解除中ならその鍵でそのまま暗号化する
 * - 「今回だけ」を選ぶと、どこにも保存せずメモリーにだけ持つ（タブを閉じると消える）
 * - 解除したキーはこのモジュールの変数（メモリー）にだけ置く。状態管理（zustand）・設定・バックアップ・ログには入れない
 * - 以前の形（キーごとに合言葉で暗号化したもの）は、その合言葉で解除したときにアプリの合言葉の形に移す
 *
 * 注意: 同じページで悪意のあるスクリプトが動くと、解除中のキーは使われてしまう。
 * 暗号化は「保存中のデータ（端末・同じオリジンのほかのアプリ・書き出したファイル）から読まれない」ための対策で、
 * ページ自体の安全は CSP（送信先の限定）などで守る。考え方は docs/CLOUD_AI.md。
 */
import { STORAGE_PREFIX } from '@/lib/constants';

export type CloudProviderId = 'gemini' | 'openai' | 'anthropic' | 'openrouter';

const PROVIDER_IDS: CloudProviderId[] = ['gemini', 'openai', 'anthropic', 'openrouter'];

interface Cipher {
  iv: string;
  data: string;
}

/** 以前の形: キーごとに合言葉から鍵を作って暗号化したもの */
interface LegacySecret extends Cipher {
  v: 1;
  /** PBKDF2 の繰り返し回数 */
  iterations: number;
  salt: string;
  /** キーの末尾 4 文字（どのキーを保存したか見分けるため。全体は分からない） */
  hint: string;
  savedAt: number;
}

/** 今の形: アプリの合言葉の鍵で暗号化したもの */
interface VaultSecret extends Cipher {
  v: 2;
  hint: string;
  savedAt: number;
}

type StoredSecret = LegacySecret | VaultSecret;

/** アプリの合言葉の情報（ソルトと、合言葉が合っているかを確かめる暗号文） */
interface VaultMeta {
  v: 1;
  iterations: number;
  salt: string;
  check: Cipher;
}

/** OWASP の推奨（PBKDF2-HMAC-SHA256）に合わせる */
export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 8;

const storageKey = (provider: CloudProviderId) => `${STORAGE_PREFIX}:cloud-key:${provider}`;
const VAULT_KEY = `${STORAGE_PREFIX}:cloud-vault`;
/** 合言葉の確かめ用に暗号化する決まった文 */
const CHECK_TEXT = 'lllm-study-vault';

/** 解除済みのキー（メモリーにだけ置く） */
const unlocked = new Map<CloudProviderId, string>();
/** アプリの合言葉から作った鍵（取り出せない形）。ロック中は null */
let vaultKey: CryptoKey | null = null;
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

async function encrypt(aes: CryptoKey, text: string): Promise<Cipher> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    aes,
    new TextEncoder().encode(text),
  );
  return { iv: toB64(iv), data: toB64(data) };
}

/** 復号する。鍵が違えば null */
async function decrypt(aes: CryptoKey, c: Cipher): Promise<string | null> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromB64(c.iv) as BufferSource },
      aes,
      fromB64(c.data) as BufferSource,
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function readStored(provider: CloudProviderId): StoredSecret | null {
  const s = readJson<StoredSecret>(storageKey(provider));
  return s && (s.v === 1 || s.v === 2) && s.data ? s : null;
}

function readMeta(): VaultMeta | null {
  const m = readJson<VaultMeta>(VAULT_KEY);
  return m && m.v === 1 && m.salt && m.check ? m : null;
}

function checkPassphrase(passphrase: string) {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH)
    throw new Error(`合言葉は ${MIN_PASSPHRASE_LENGTH} 文字以上にしてください`);
}

async function writeVaultSecret(aes: CryptoKey, provider: CloudProviderId, key: string) {
  const stored: VaultSecret = {
    v: 2,
    ...(await encrypt(aes, key)),
    hint: keyHint(key),
    savedAt: Date.now(),
  };
  localStorage.setItem(storageKey(provider), JSON.stringify(stored));
}

export function keyHint(key: string): string {
  return key.trim().slice(-4);
}

/** 暗号化して保存したキーがあるか（解除しなくても分かる） */
export function storedKeyInfo(provider: CloudProviderId): { hint: string; savedAt: number } | null {
  const s = readStored(provider);
  return s ? { hint: s.hint, savedAt: s.savedAt } : null;
}

/** 以前の形（キーごとの合言葉）で保存したキーか */
export function isLegacyKey(provider: CloudProviderId): boolean {
  return readStored(provider)?.v === 1;
}

/**
 * アプリの合言葉の状態。none: まだ決めていない（保存したキーもない）、locked: ロック中、open: 解除中
 */
export function vaultState(): 'none' | 'locked' | 'open' {
  if (vaultKey) return 'open';
  if (readMeta() || PROVIDER_IDS.some((p) => readStored(p))) return 'locked';
  return 'none';
}

export function isUnlocked(provider: CloudProviderId): boolean {
  return unlocked.has(provider);
}

/** 解除済みのキー。ロック中なら null（呼び出し側でキーを画面や記録に出さないこと） */
export function getUnlockedKey(provider: CloudProviderId): string | null {
  return unlocked.get(provider) ?? null;
}

/** アプリの合言葉を決める（はじめて保存するとき）。決めたら解除中になる */
export async function createVault(
  passphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<void> {
  checkPassphrase(passphrase);
  if (readMeta()) throw new Error('アプリの合言葉はもう決まっています');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const aes = await deriveKey(passphrase, salt, iterations);
  const meta: VaultMeta = {
    v: 1,
    iterations,
    salt: toB64(salt),
    check: await encrypt(aes, CHECK_TEXT),
  };
  localStorage.setItem(VAULT_KEY, JSON.stringify(meta));
  vaultKey = aes;
  emit();
}

/** 以前の形のキーを合言葉で取り出す（違えば null） */
async function decryptLegacy(s: LegacySecret, passphrase: string): Promise<string | null> {
  const aes = await deriveKey(passphrase, fromB64(s.salt), s.iterations);
  return decrypt(aes, s);
}

/**
 * アプリの合言葉で解除し、保存したすべてのキーを使えるようにする。合言葉が違えば例外。
 * 以前の形のキーも同じ合言葉なら取り出して、アプリの合言葉の形に移す。
 * まだアプリの合言葉がなく以前の形のキーだけがあるときは、それを解除できた合言葉をアプリの合言葉にする。
 * 戻り値は、解除できた接続先
 */
export async function openVault(passphrase: string): Promise<CloudProviderId[]> {
  const meta = readMeta();
  const legacyPlain = new Map<CloudProviderId, string>();
  if (meta) {
    const aes = await deriveKey(passphrase, fromB64(meta.salt), meta.iterations);
    if ((await decrypt(aes, meta.check)) !== CHECK_TEXT) throw new Error('合言葉が違います');
    vaultKey = aes;
  } else {
    // 以前の形のキーだけがある: 解除できた合言葉をアプリの合言葉にする
    let iterations = PBKDF2_ITERATIONS;
    for (const p of PROVIDER_IDS) {
      const s = readStored(p);
      if (s?.v !== 1) continue;
      const key = await decryptLegacy(s, passphrase);
      if (key !== null) {
        legacyPlain.set(p, key);
        iterations = s.iterations;
      }
    }
    if (!legacyPlain.size) throw new Error('合言葉が違います');
    await createVault(passphrase, iterations);
  }
  const aes = vaultKey!;
  const opened: CloudProviderId[] = [];
  for (const p of PROVIDER_IDS) {
    const s = readStored(p);
    if (!s) continue;
    let key: string | null;
    if (s.v === 2) key = await decrypt(aes, s);
    else {
      key = legacyPlain.get(p) ?? (await decryptLegacy(s, passphrase));
      // 同じ合言葉だった以前の形のキーは、アプリの合言葉の形に移す
      if (key !== null) await writeVaultSecret(aes, p, key);
    }
    if (key !== null) {
      unlocked.set(p, key);
      opened.push(p);
    }
  }
  emit();
  return opened;
}

/**
 * 別の合言葉で保存した以前の形のキーを、その合言葉で解除する。
 * アプリの合言葉が解除中なら、アプリの合言葉の形に移す（次からはアプリの合言葉だけで使える）
 */
export async function unlockLegacyKey(
  provider: CloudProviderId,
  passphrase: string,
): Promise<void> {
  const s = readStored(provider);
  if (s?.v !== 1) throw new Error('別の合言葉で保存したキーではありません');
  const key = await decryptLegacy(s, passphrase);
  if (key === null) throw new Error('合言葉が違います');
  if (vaultKey) await writeVaultSecret(vaultKey, provider, key);
  unlocked.set(provider, key);
  emit();
}

/**
 * キーを登録する。vault ならアプリの合言葉で暗号化してこの端末に保存し（解除中であること）、
 * session なら（今回だけ）メモリーにだけ持つ。どちらの場合も、登録したキーはすぐに使える
 */
export async function saveKey(
  provider: CloudProviderId,
  apiKey: string,
  mode: 'vault' | 'session',
): Promise<void> {
  const key = apiKey.trim();
  if (!key) throw new Error('API キーを入力してください');
  if (mode === 'vault') {
    if (!vaultKey) throw new Error('アプリの合言葉で解除してから登録してください');
    await writeVaultSecret(vaultKey, provider, key);
  } else {
    // 今回だけ: 以前に暗号化して保存したキーは残さない（どちらのキーを使っているか分からなくなるため）
    localStorage.removeItem(storageKey(provider));
  }
  unlocked.set(provider, key);
  emit();
}

/** ロックする（保存したキーをすべてメモリーから消す。暗号文は残る。今回だけのキーはそのまま） */
export function lockVault(): void {
  vaultKey = null;
  for (const p of [...unlocked.keys()]) if (readStored(p)) unlocked.delete(p);
  emit();
}

/**
 * アプリの合言葉を変える（保存したすべてのキーを新しい合言葉で暗号化し直す）。
 * 解除中で、保存したキーがすべて解除できていること
 */
export async function changePassphrase(
  newPassphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<void> {
  checkPassphrase(newPassphrase);
  if (!vaultKey) throw new Error('今の合言葉で解除してから変えてください');
  const stored = PROVIDER_IDS.filter((p) => readStored(p));
  if (stored.some((p) => !unlocked.has(p)))
    throw new Error('ロック中のキーがあります。先に解除するか、削除してください');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const aes = await deriveKey(newPassphrase, salt, iterations);
  for (const p of stored) await writeVaultSecret(aes, p, unlocked.get(p)!);
  const meta: VaultMeta = {
    v: 1,
    iterations,
    salt: toB64(salt),
    check: await encrypt(aes, CHECK_TEXT),
  };
  localStorage.setItem(VAULT_KEY, JSON.stringify(meta));
  vaultKey = aes;
  emit();
}

/** 保存したキーとメモリーのキーをどちらも消す */
export function deleteKey(provider: CloudProviderId): void {
  localStorage.removeItem(storageKey(provider));
  unlocked.delete(provider);
  pending.delete(provider);
  emit();
}

/** アプリの合言葉の情報も消す（すべてのキーを消したあと。合言葉を忘れたときのやり直し） */
export function deleteVault(): void {
  localStorage.removeItem(VAULT_KEY);
  vaultKey = null;
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
