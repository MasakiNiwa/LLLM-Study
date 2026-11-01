/**
 * クラウド AI の API キーの保管庫（ブラウザ内だけで完結する。サーバーには送らない）。
 *
 * - 既定は「アプリの合言葉で暗号化して、この端末に保存」。合言葉は 1 つで、すべての API キーに共通
 *   - ランダムなデータ鍵（DEK, AES-GCM 256bit）で各 API キーを暗号化する
 *   - DEK は「合言葉から PBKDF2 で作った鍵」で暗号化して保存する（合言葉を変えても API キーは暗号化し直さなくてよい）
 *   - パスキー（生体認証）を登録すると、WebAuthn の PRF 拡張から得た秘密値でも DEK を暗号化して保存する。
 *     指紋・顔認証などの 1 回の操作で、すべての API キーが使える
 *   - 解除中はメモリーに取り出せない形の DEK（CryptoKey）だけを置き、合言葉も DEK の中身も持たない。
 *     パスキーの登録・合言葉の変更のときだけ、合言葉で DEK の中身を一時的に取り出す
 *   - 使わない時間が続くと自動でロックする（設定で変えられる）
 * - API キーは会社（接続先）ごとに何本でも登録できる（個人用・仕事用など）。名前・登録したモデルなどの
 *   秘密でない情報は一覧（cloud-keys）に、API キーそのものは暗号化して別の場所に置く
 * - 「今回だけ」を選ぶと、どこにも保存せずメモリーにだけ持つ（タブを閉じると消える）
 * - 解除したキーはこのモジュールの変数（メモリー）にだけ置く。状態管理（zustand）・設定・バックアップ・ログには入れない
 * - 以前の形（キーごとの合言葉・合言葉から直接作った鍵）は、解除したときに今の形に移す
 *
 * 注意: 同じページで悪意のあるスクリプトが動くと、解除中のキーは使われてしまう。
 * 暗号化は「保存中のデータ（端末・同じオリジンのほかのアプリ・書き出したファイル）から読まれない」ための対策で、
 * ページ自体の安全は CSP（送信先の限定）などで守る。考え方は docs/CLOUD_AI.md。
 */
import { STORAGE_PREFIX } from '@/lib/constants';

export type CloudProviderId = 'gemini' | 'openai' | 'anthropic' | 'openrouter';
/** 登録した API キーの id（以前から登録していたキーは会社の id と同じ） */
export type CloudKeyId = string;

export const CLOUD_PROVIDER_ID_LIST: CloudProviderId[] = [
  'gemini',
  'openai',
  'anthropic',
  'openrouter',
];

/** 登録した API キーの、秘密でない情報 */
export interface KeyEntry {
  id: CloudKeyId;
  provider: CloudProviderId;
  /** 名前（例: 個人用）。空なら会社の名前で表示する */
  label: string;
  /** このキーで使うモデル（マイモデル。選ぶ画面の先頭に出す） */
  models: string[];
  createdAt: number;
  /** 今回だけ（保存していない） */
  session?: boolean;
}

interface Cipher {
  iv: string;
  data: string;
}

/** 以前の形 1: キーごとに合言葉から鍵を作って暗号化したもの */
interface LegacySecret extends Cipher {
  v: 1;
  iterations: number;
  salt: string;
  /** キーの末尾 4 文字（どのキーを保存したか見分けるため。全体は分からない） */
  hint: string;
  savedAt: number;
}

/** 以前の形 2: 合言葉から直接作った鍵で暗号化したもの */
interface DirectSecret extends Cipher {
  v: 2;
  hint: string;
  savedAt: number;
}

/** 今の形: データ鍵（DEK）で暗号化したもの */
interface DekSecret extends Cipher {
  v: 3;
  hint: string;
  savedAt: number;
}

type StoredSecret = LegacySecret | DirectSecret | DekSecret;

/** 以前の保管庫の情報（合言葉から直接作った鍵の確かめ用） */
interface VaultMetaV1 {
  v: 1;
  iterations: number;
  salt: string;
  check: Cipher;
}

interface PasskeyRecord {
  credentialId: string;
  prfSalt: string;
  /** PRF の出力から作った鍵で暗号化した DEK */
  wrapped: Cipher;
  createdAt: number;
}

/** 保管庫の情報: 合言葉で暗号化した DEK と、パスキーで暗号化した DEK */
interface VaultMetaV2 {
  v: 2;
  iterations: number;
  salt: string;
  wrapped: Cipher;
  passkey?: PasskeyRecord;
}

/** OWASP の推奨（PBKDF2-HMAC-SHA256）に合わせる */
export const PBKDF2_ITERATIONS = 600_000;
export const MIN_PASSPHRASE_LENGTH = 8;

const secretKey = (id: CloudKeyId) => `${STORAGE_PREFIX}:cloud-key:${id}`;
const VAULT_KEY = `${STORAGE_PREFIX}:cloud-vault`;
const REGISTRY_KEY = `${STORAGE_PREFIX}:cloud-keys`;
const CHECK_TEXT = 'lllm-study-vault';

/** 解除済みのキー（メモリーにだけ置く） */
const unlocked = new Map<CloudKeyId, string>();
/** 今回だけのキーの情報（保存しない） */
const sessionEntries = new Map<CloudKeyId, KeyEntry>();
/** データ鍵（取り出せない形）。ロック中は null */
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

// ---------------------------------------------------------------- 暗号の道具

const rand = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const toB64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64Url = (s: string) => s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function passphraseKey(passphrase: string, salt: Uint8Array, iterations: number) {
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

/** PRF の出力（パスキーごとの秘密値）から、DEK を暗号化する鍵を作る */
async function prfKey(prf: ArrayBuffer) {
  const base = await crypto.subtle.importKey('raw', prf, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('lllm-study-vault'),
      info: new TextEncoder().encode('dek-wrap'),
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/** DEK の中身から、取り出せない形の鍵を作る */
const importDek = (raw: Uint8Array) =>
  crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, ['encrypt', 'decrypt']);

async function encryptBytes(aes: CryptoKey, bytes: Uint8Array): Promise<Cipher> {
  const iv = rand(12);
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource },
    aes,
    bytes as BufferSource,
  );
  return { iv: toB64(iv), data: toB64(data) };
}

async function decryptBytes(aes: CryptoKey, c: Cipher): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: fromB64(c.iv) as BufferSource },
        aes,
        fromB64(c.data) as BufferSource,
      ),
    );
  } catch {
    return null;
  }
}

const encryptText = (aes: CryptoKey, text: string) =>
  encryptBytes(aes, new TextEncoder().encode(text));

async function decryptText(aes: CryptoKey, c: Cipher): Promise<string | null> {
  const bytes = await decryptBytes(aes, c);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

// ---------------------------------------------------------------- 保存の読み書き

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function readStored(id: CloudKeyId): StoredSecret | null {
  const s = readJson<StoredSecret>(secretKey(id));
  return s && (s.v === 1 || s.v === 2 || s.v === 3) && s.data ? s : null;
}

function readMeta(): VaultMetaV1 | VaultMetaV2 | null {
  const m = readJson<VaultMetaV1 | VaultMetaV2>(VAULT_KEY);
  if (!m?.salt) return null;
  return (m.v === 1 && m.check) || (m.v === 2 && m.wrapped) ? m : null;
}

const writeMeta = (m: VaultMetaV2) => localStorage.setItem(VAULT_KEY, JSON.stringify(m));

function checkPassphrase(passphrase: string) {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH)
    throw new Error(`合言葉は ${MIN_PASSPHRASE_LENGTH} 文字以上にしてください`);
}

async function writeSecret(aes: CryptoKey, id: CloudKeyId, key: string) {
  const stored: DekSecret = {
    v: 3,
    ...(await encryptText(aes, key)),
    hint: keyHint(key),
    savedAt: Date.now(),
  };
  localStorage.setItem(secretKey(id), JSON.stringify(stored));
}

// ---------------------------------------------------------------- 登録した API キーの一覧

function writeRegistry(list: KeyEntry[]) {
  localStorage.setItem(REGISTRY_KEY, JSON.stringify(list.filter((e) => !e.session)));
}

/** 保存したキーの一覧（一覧がまだなければ、以前の形のキー（会社ごとに 1 本）から作る） */
function readRegistry(): KeyEntry[] {
  const list = readJson<KeyEntry[]>(REGISTRY_KEY);
  if (Array.isArray(list)) return list.filter((e) => e?.id && e.provider);
  const migrated = CLOUD_PROVIDER_ID_LIST.filter((p) => readStored(p)).map((p): KeyEntry => ({
    id: p,
    provider: p,
    label: '',
    models: [],
    createdAt: readStored(p)!.savedAt,
  }));
  if (migrated.length) writeRegistry(migrated);
  return migrated;
}

/** 登録した API キー（保存したものと今回だけのもの） */
export function listKeys(): KeyEntry[] {
  return [...readRegistry(), ...sessionEntries.values()];
}

export function getKeyEntry(id: CloudKeyId): KeyEntry | null {
  return listKeys().find((e) => e.id === id) ?? null;
}

/** 名前・マイモデルを変える */
export function updateKeyEntry(id: CloudKeyId, patch: Partial<Pick<KeyEntry, 'label' | 'models'>>) {
  const session = sessionEntries.get(id);
  if (session) sessionEntries.set(id, { ...session, ...patch });
  else writeRegistry(readRegistry().map((e) => (e.id === id ? { ...e, ...patch } : e)));
  emit();
}

const newKeyId = (provider: CloudProviderId) => `${provider}-${toB64Url(toB64(rand(6)))}`;

// ---------------------------------------------------------------- 状態

export function keyHint(key: string): string {
  return key.trim().slice(-4);
}

/** 暗号化して保存したキーがあるか（解除しなくても分かる） */
export function storedKeyInfo(id: CloudKeyId): { hint: string; savedAt: number } | null {
  const s = readStored(id);
  return s ? { hint: s.hint, savedAt: s.savedAt } : null;
}

/** 以前の形（キーごとの別の合言葉）で保存したキーか */
export function isLegacyKey(id: CloudKeyId): boolean {
  return readStored(id)?.v === 1;
}

/** アプリの合言葉の状態。none: まだ決めていない（保存したキーもない）、locked: ロック中、open: 解除中 */
export function vaultState(): 'none' | 'locked' | 'open' {
  if (vaultKey) return 'open';
  if (readMeta() || readRegistry().some((e) => readStored(e.id))) return 'locked';
  return 'none';
}

export function isUnlocked(id: CloudKeyId): boolean {
  return unlocked.has(id);
}

/** 解除済みのキー。ロック中なら null（呼び出し側でキーを画面や記録に出さないこと） */
export function getUnlockedKey(id: CloudKeyId): string | null {
  const key = unlocked.get(id) ?? null;
  if (key) touch();
  return key;
}

// ---------------------------------------------------------------- 自動ロック

let autoLockMs = 60 * 60 * 1000;
let lockTimer: ReturnType<typeof setTimeout> | undefined;

/** 使わない時間がこれだけ続いたらロックする（0 でしない） */
export function setAutoLock(ms: number) {
  autoLockMs = ms;
  touch();
}

/** 使うたびに自動ロックまでの時間を延ばす */
function touch() {
  clearTimeout(lockTimer);
  if (vaultKey && autoLockMs > 0) lockTimer = setTimeout(lockVault, autoLockMs);
}

// ---------------------------------------------------------------- 合言葉

/** アプリの合言葉を決める（はじめて保存するとき）。決めたら解除中になる */
export async function createVault(
  passphrase: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<void> {
  checkPassphrase(passphrase);
  if (readMeta()) throw new Error('アプリの合言葉はもう決まっています');
  const salt = rand(16);
  const raw = rand(32);
  const k = await passphraseKey(passphrase, salt, iterations);
  writeMeta({ v: 2, iterations, salt: toB64(salt), wrapped: await encryptBytes(k, raw) });
  vaultKey = await importDek(raw);
  touch();
  emit();
}

async function decryptLegacy(s: LegacySecret, passphrase: string): Promise<string | null> {
  const k = await passphraseKey(passphrase, fromB64(s.salt), s.iterations);
  return decryptText(k, s);
}

/** 保存したすべてのキーを DEK で取り出す（以前の形は、渡された鍵・合言葉で取り出して今の形に移す） */
async function openAll(old?: { direct?: CryptoKey; passphrase?: string }): Promise<CloudKeyId[]> {
  const aes = vaultKey!;
  const opened: CloudKeyId[] = [];
  for (const e of readRegistry()) {
    const s = readStored(e.id);
    if (!s) continue;
    let key: string | null = null;
    if (s.v === 3) key = await decryptText(aes, s);
    else {
      if (s.v === 2 && old?.direct) key = await decryptText(old.direct, s);
      if (s.v === 1 && old?.passphrase) key = await decryptLegacy(s, old.passphrase);
      if (key !== null) await writeSecret(aes, e.id, key);
    }
    if (key !== null) {
      unlocked.set(e.id, key);
      opened.push(e.id);
    }
  }
  touch();
  emit();
  return opened;
}

/**
 * アプリの合言葉で解除し、保存したすべてのキーを使えるようにする。合言葉が違えば例外。
 * まだアプリの合言葉がなく以前の形のキーだけがあるときは、それを解除できた合言葉をアプリの合言葉にする。
 * 戻り値は、解除できたキーの id
 */
export async function openVault(passphrase: string): Promise<CloudKeyId[]> {
  const meta = readMeta();
  if (meta?.v === 2) {
    const k = await passphraseKey(passphrase, fromB64(meta.salt), meta.iterations);
    const raw = await decryptBytes(k, meta.wrapped);
    if (!raw) throw new Error('合言葉が違います');
    vaultKey = await importDek(raw);
    return openAll({ passphrase });
  }
  if (meta?.v === 1) {
    // 以前の形（合言葉から直接作った鍵）: DEK を作って、合言葉で暗号化した形に移す
    const direct = await passphraseKey(passphrase, fromB64(meta.salt), meta.iterations);
    if ((await decryptText(direct, meta.check)) !== CHECK_TEXT) throw new Error('合言葉が違います');
    const raw = rand(32);
    writeMeta({
      v: 2,
      iterations: meta.iterations,
      salt: meta.salt,
      wrapped: await encryptBytes(direct, raw),
    });
    vaultKey = await importDek(raw);
    return openAll({ direct, passphrase });
  }
  // 以前の形のキー（キーごとの合言葉）だけがある: 解除できた合言葉をアプリの合言葉にする
  let iterations = PBKDF2_ITERATIONS;
  let ok = false;
  for (const e of readRegistry()) {
    const s = readStored(e.id);
    if (s?.v === 1 && (await decryptLegacy(s, passphrase)) !== null) {
      ok = true;
      iterations = s.iterations;
      break;
    }
  }
  if (!ok) throw new Error('合言葉が違います');
  await createVault(passphrase, iterations);
  return openAll({ passphrase });
}

/** 別の合言葉で保存した以前の形のキーを、その合言葉で解除する（解除中なら今の形に移す） */
export async function unlockLegacyKey(id: CloudKeyId, passphrase: string): Promise<void> {
  const s = readStored(id);
  if (s?.v !== 1) throw new Error('別の合言葉で保存したキーではありません');
  const key = await decryptLegacy(s, passphrase);
  if (key === null) throw new Error('合言葉が違います');
  if (vaultKey) await writeSecret(vaultKey, id, key);
  unlocked.set(id, key);
  emit();
}

/** 合言葉で DEK の中身を一時的に取り出す（パスキーの登録・合言葉の変更のときだけ） */
async function dekWithPassphrase(
  passphrase: string,
): Promise<{ raw: Uint8Array; meta: VaultMetaV2 }> {
  let meta = readMeta();
  if (meta?.v === 1) {
    await openVault(passphrase);
    meta = readMeta();
  }
  if (meta?.v !== 2) throw new Error('アプリの合言葉がまだ決まっていません');
  const k = await passphraseKey(passphrase, fromB64(meta.salt), meta.iterations);
  const raw = await decryptBytes(k, meta.wrapped);
  if (!raw) throw new Error('合言葉が違います');
  return { raw, meta };
}

/** アプリの合言葉を変える（DEK を新しい合言葉で暗号化し直す。API キーとパスキーはそのまま使える） */
export async function changePassphrase(
  current: string,
  next: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<void> {
  checkPassphrase(next);
  const { raw, meta } = await dekWithPassphrase(current);
  const salt = rand(16);
  const k = await passphraseKey(next, salt, iterations);
  writeMeta({ ...meta, iterations, salt: toB64(salt), wrapped: await encryptBytes(k, raw) });
  emit();
}

// ---------------------------------------------------------------- パスキー（生体認証）

export const passkeySupported = () =>
  typeof window !== 'undefined' && typeof window.PublicKeyCredential === 'function';

export function hasPasskey(): boolean {
  const m = readMeta();
  return m?.v === 2 && !!m.passkey;
}

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } } };

async function evalPrf(p: { credentialId: string; prfSalt: string }): Promise<ArrayBuffer> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: rand(32) as BufferSource,
      allowCredentials: [{ type: 'public-key', id: fromB64(p.credentialId) as BufferSource }],
      userVerification: 'required',
      extensions: {
        prf: { evalByCredential: { [toB64Url(p.credentialId)]: { first: fromB64(p.prfSalt) } } },
      } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!assertion) throw new Error('認証がキャンセルされました');
  const first = (assertion.getClientExtensionResults() as PrfResults).prf?.results?.first;
  if (!first)
    throw new Error('この端末のパスキーから秘密値を受け取れませんでした（PRF 拡張に未対応）');
  return first;
}

/**
 * パスキー（指紋・顔認証など）を登録する。合言葉で DEK の中身を一時的に取り出し、
 * パスキーの PRF 拡張の出力から作った鍵で暗号化して保存する（登録し直すと置き換える）
 */
export async function registerPasskey(passphrase: string): Promise<void> {
  if (!passkeySupported()) throw new Error('このブラウザはパスキーに対応していません');
  const { raw, meta } = await dekWithPassphrase(passphrase);
  const prfSalt = rand(32);
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: rand(32) as BufferSource,
      rp: { name: 'LLLM Study' },
      user: {
        id: rand(16) as BufferSource,
        name: 'lllm-study',
        displayName: 'LLLM Study（API キー）',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { userVerification: 'required', residentKey: 'preferred' },
      extensions: { prf: { eval: { first: prfSalt } } } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('登録がキャンセルされました');
  const ext = cred.getClientExtensionResults() as PrfResults;
  if (!ext.prf?.enabled && !ext.prf?.results?.first)
    throw new Error(
      'この端末・ブラウザのパスキーは PRF 拡張に対応していないため、生体認証での解除は使えません',
    );
  const credentialId = toB64(cred.rawId);
  // 登録のときに PRF の結果を返さない認証器もあるので、そのときは一度認証して受け取る
  const prf = ext.prf.results?.first ?? (await evalPrf({ credentialId, prfSalt: toB64(prfSalt) }));
  const k = await prfKey(prf);
  writeMeta({
    ...meta,
    passkey: {
      credentialId,
      prfSalt: toB64(prfSalt),
      wrapped: await encryptBytes(k, raw),
      createdAt: Date.now(),
    },
  });
  emit();
}

/** パスキー（生体認証）で解除する */
export async function unlockWithPasskey(): Promise<CloudKeyId[]> {
  const meta = readMeta();
  if (meta?.v !== 2 || !meta.passkey) throw new Error('生体認証が登録されていません');
  const prf = await evalPrf(meta.passkey);
  const raw = await decryptBytes(await prfKey(prf), meta.passkey.wrapped);
  if (!raw) throw new Error('生体認証で解除できませんでした。合言葉で解除してください');
  vaultKey = await importDek(raw);
  return openAll();
}

export function removePasskey(): void {
  const meta = readMeta();
  if (meta?.v !== 2) return;
  const { passkey: _p, ...rest } = meta;
  writeMeta(rest);
  emit();
}

// ---------------------------------------------------------------- キーの登録・削除

/**
 * API キーを登録する。vault ならアプリの合言葉で暗号化してこの端末に保存し（解除中であること）、
 * session なら（今回だけ）メモリーにだけ持つ。戻り値は登録したキーの id。登録したキーはすぐに使える
 */
export async function addKey(
  provider: CloudProviderId,
  apiKey: string,
  mode: 'vault' | 'session',
  info: { label?: string; models?: string[] } = {},
): Promise<CloudKeyId> {
  const key = apiKey.trim();
  if (!key) throw new Error('API キーを入力してください');
  if (mode === 'vault' && !vaultKey)
    throw new Error('アプリの合言葉で解除してから登録してください');
  const entry: KeyEntry = {
    id: newKeyId(provider),
    provider,
    label: info.label?.trim() ?? '',
    models: info.models ?? [],
    createdAt: Date.now(),
  };
  if (mode === 'vault') {
    await writeSecret(vaultKey!, entry.id, key);
    writeRegistry([...readRegistry(), entry]);
  } else {
    sessionEntries.set(entry.id, { ...entry, session: true });
  }
  unlocked.set(entry.id, key);
  emit();
  return entry.id;
}

/** ロックする（保存したキーをすべてメモリーから消す。暗号文は残る。今回だけのキーはそのまま） */
export function lockVault(): void {
  vaultKey = null;
  clearTimeout(lockTimer);
  for (const id of [...unlocked.keys()]) if (!sessionEntries.has(id)) unlocked.delete(id);
  emit();
}

/** 保存したキーとメモリーのキーをどちらも消す */
export function deleteKey(id: CloudKeyId): void {
  localStorage.removeItem(secretKey(id));
  writeRegistry(readRegistry().filter((e) => e.id !== id));
  sessionEntries.delete(id);
  unlocked.delete(id);
  emit();
}

/** 保管庫の情報も消す（すべてのキーを消したあと。合言葉を忘れたときのやり直し） */
export function deleteVault(): void {
  for (const e of listKeys()) deleteKey(e.id);
  localStorage.removeItem(VAULT_KEY);
  localStorage.removeItem(REGISTRY_KEY);
  vaultKey = null;
  emit();
}

// ---------------------------------------------------------------- ログインで受け取ったキー

/**
 * ログイン（OpenRouter の OAuth）で受け取った、まだ保存していないキー。
 * 保存するまでのあいだ、メモリーにだけ置く（画面にもストアにも出さない）
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
