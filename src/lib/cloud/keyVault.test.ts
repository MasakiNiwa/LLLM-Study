import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addKey,
  changePassphrase,
  createVault,
  deleteVault,
  getUnlockedKey,
  hasPasskey,
  isLegacyKey,
  isUnlocked,
  listKeys,
  lockVault,
  openVault,
  registerPasskey,
  storedKeyInfo,
  unlockLegacyKey,
  unlockWithPasskey,
  updateKeyEntry,
  vaultState,
  type CloudKeyId,
} from './keyVault';

// テストでは速くするため繰り返し回数を減らす
const FAST = 1000;

beforeEach(() => {
  const store = new Map<string, string>();
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
  deleteVault();
});

afterEach(() => vi.unstubAllGlobals());

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));

async function pbkdf(passphrase: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations: FAST },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
}

async function encrypt(aes: CryptoKey, text: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aes,
    new TextEncoder().encode(text),
  );
  return { iv: b64(iv), data: b64(data) };
}

/** 以前の形 1（キーごとに合言葉で暗号化）のキーを直接書く */
async function writeLegacy(id: CloudKeyId, key: string, passphrase: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const c = await encrypt(await pbkdf(passphrase, salt), key);
  localStorage.setItem(
    `lllm-study:cloud-key:${id}`,
    JSON.stringify({
      v: 1,
      iterations: FAST,
      salt: b64(salt),
      ...c,
      hint: key.slice(-4),
      savedAt: 1,
    }),
  );
}

/** 以前の形 2（合言葉から直接作った鍵で暗号化。v1.11 の形）の保管庫とキーを直接書く */
async function writeDirectVault(passphrase: string, keys: Record<string, string>) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const aes = await pbkdf(passphrase, salt);
  localStorage.setItem(
    'lllm-study:cloud-vault',
    JSON.stringify({
      v: 1,
      iterations: FAST,
      salt: b64(salt),
      check: await encrypt(aes, 'lllm-study-vault'),
    }),
  );
  for (const [id, key] of Object.entries(keys))
    localStorage.setItem(
      `lllm-study:cloud-key:${id}`,
      JSON.stringify({ v: 2, ...(await encrypt(aes, key)), hint: key.slice(-4), savedAt: 1 }),
    );
}

describe('keyVault（アプリの合言葉とデータ鍵）', () => {
  it('アプリの合言葉で暗号化して保存し、キーそのものも合言葉も保存しない', async () => {
    expect(vaultState()).toBe('none');
    await createVault('correct horse', FAST);
    const id = await addKey('gemini', '  AIzaSyTEST-1234abcd  ', 'vault', { label: '個人用' });
    const all = [...Array(localStorage.length).keys()]
      .map((i) => localStorage.getItem(localStorage.key(i)!))
      .join('\n');
    expect(all).not.toContain('AIzaSyTEST');
    expect(all).not.toContain('correct horse');
    expect(storedKeyInfo(id)).toMatchObject({ hint: 'abcd' });
    expect(getUnlockedKey(id)).toBe('AIzaSyTEST-1234abcd');
    expect(listKeys()).toMatchObject([{ id, provider: 'gemini', label: '個人用' }]);
  });

  it('同じ会社のキーを何本でも登録でき、1 回の合言葉ですべて解除する', async () => {
    await createVault('correct horse', FAST);
    const a = await addKey('openai', 'sk-personal', 'vault', { label: '個人用' });
    const b = await addKey('openai', 'sk-work', 'vault', { label: '仕事用' });
    const c = await addKey('openrouter', 'sk-or-free', 'vault');
    lockVault();
    expect(vaultState()).toBe('locked');
    expect(isUnlocked(a)).toBe(false);
    await expect(openVault('wrong passphrase')).rejects.toThrow('合言葉が違います');
    expect(await openVault('correct horse')).toEqual([a, b, c]);
    expect(getUnlockedKey(b)).toBe('sk-work');
  });

  it('マイモデルと名前は秘密でない一覧に保存する', async () => {
    await createVault('correct horse', FAST);
    const id = await addKey('anthropic', 'sk-ant-1', 'vault');
    updateKeyEntry(id, { models: ['claude-haiku-5-5'], label: '仕事用' });
    lockVault();
    expect(listKeys()[0]).toMatchObject({ label: '仕事用', models: ['claude-haiku-5-5'] });
  });

  it('ロック中は合言葉なしで保存できない。今回だけはどこにも保存しない', async () => {
    await createVault('correct horse', FAST);
    lockVault();
    await expect(addKey('openai', 'sk-x', 'vault')).rejects.toThrow('解除してから');
    const id = await addKey('gemini', 'AIzaSyNEW-9999', 'session');
    expect(storedKeyInfo(id)).toBeNull();
    expect(getUnlockedKey(id)).toBe('AIzaSyNEW-9999');
    // 今回だけのキーはロックしても残る
    lockVault();
    expect(getUnlockedKey(id)).toBe('AIzaSyNEW-9999');
  });

  it('短すぎる合言葉・空のキーは受け付けない', async () => {
    await expect(createVault('short', FAST)).rejects.toThrow('8 文字以上');
    await createVault('long enough', FAST);
    await expect(addKey('gemini', '   ', 'vault')).rejects.toThrow('API キー');
  });

  it('合言葉を変えても、API キーは暗号化し直さずにそのまま使える', async () => {
    await createVault('correct horse', FAST);
    const id = await addKey('gemini', 'AIza-1', 'vault');
    const before = localStorage.getItem(`lllm-study:cloud-key:${id}`);
    await expect(changePassphrase('wrong one!', 'new passphrase', FAST)).rejects.toThrow(
      '合言葉が違います',
    );
    await changePassphrase('correct horse', 'new passphrase', FAST);
    expect(localStorage.getItem(`lllm-study:cloud-key:${id}`)).toBe(before);
    lockVault();
    await expect(openVault('correct horse')).rejects.toThrow('合言葉が違います');
    expect(await openVault('new passphrase')).toEqual([id]);
  });

  it('v1.11 の形（合言葉から直接作った鍵）は、解除したときにデータ鍵の形に移す', async () => {
    await writeDirectVault('app pass phrase', { gemini: 'AIza-old', openai: 'sk-old' });
    expect(vaultState()).toBe('locked');
    expect(await openVault('app pass phrase')).toEqual(['gemini', 'openai']);
    expect(JSON.parse(localStorage.getItem('lllm-study:cloud-key:gemini')!).v).toBe(3);
    expect(listKeys().map((k) => k.provider)).toEqual(['gemini', 'openai']);
    lockVault();
    expect(await openVault('app pass phrase')).toEqual(['gemini', 'openai']);
    expect(getUnlockedKey('openai')).toBe('sk-old');
  });

  it('キーごとの合言葉の形は、その合言葉で解除するとアプリの合言葉の形に移す', async () => {
    await writeLegacy('gemini', 'AIza-old', 'same-pass-1');
    await writeLegacy('openai', 'sk-old', 'same-pass-1');
    await writeLegacy('anthropic', 'sk-ant-old', 'other-pass-2');
    expect(vaultState()).toBe('locked');
    expect(await openVault('same-pass-1')).toEqual(['gemini', 'openai']);
    expect(isLegacyKey('gemini')).toBe(false);
    expect(isLegacyKey('anthropic')).toBe(true);
    await unlockLegacyKey('anthropic', 'other-pass-2');
    expect(isLegacyKey('anthropic')).toBe(false);
    lockVault();
    expect(await openVault('same-pass-1')).toEqual(['gemini', 'openai', 'anthropic']);
  });
});

describe('生体認証（パスキーの PRF 拡張）', () => {
  /** 認証器のまね: 同じ salt には同じ秘密値を返す */
  function fakeAuthenticator() {
    const secret = crypto.getRandomValues(new Uint8Array(32));
    const prf = async (salt: BufferSource) => {
      const bytes = new Uint8Array(salt as ArrayBuffer);
      const mixed = new Uint8Array([...secret, ...bytes]);
      return crypto.subtle.digest('SHA-256', mixed);
    };
    const rawId = crypto.getRandomValues(new Uint8Array(16)).buffer;
    const credentials = {
      create: vi.fn(async (opts: CredentialCreationOptions) => {
        const salt = (opts.publicKey!.extensions as { prf: { eval: { first: BufferSource } } }).prf
          .eval.first;
        const first = await prf(salt);
        return {
          rawId,
          getClientExtensionResults: () => ({ prf: { enabled: true, results: { first } } }),
        };
      }),
      get: vi.fn(async (opts: CredentialRequestOptions) => {
        const byCred = (
          opts.publicKey!.extensions as {
            prf: { evalByCredential: Record<string, { first: BufferSource }> };
          }
        ).prf.evalByCredential;
        const first = await prf(Object.values(byCred)[0].first);
        return { rawId, getClientExtensionResults: () => ({ prf: { results: { first } } }) };
      }),
    };
    vi.stubGlobal('window', { PublicKeyCredential: function PublicKeyCredential() {} });
    vi.stubGlobal('navigator', { credentials });
    return credentials;
  }

  it('合言葉を確かめてパスキーを登録し、生体認証だけですべてのキーを解除する', async () => {
    const auth = fakeAuthenticator();
    await createVault('correct horse', FAST);
    const id = await addKey('openai', 'sk-1', 'vault');
    await expect(registerPasskey('wrong pass!')).rejects.toThrow('合言葉が違います');
    await registerPasskey('correct horse');
    expect(hasPasskey()).toBe(true);
    expect(auth.create).toHaveBeenCalledOnce();
    lockVault();
    expect(await unlockWithPasskey()).toEqual([id]);
    expect(getUnlockedKey(id)).toBe('sk-1');
    // 合言葉を変えても、パスキーでの解除はそのまま使える
    await changePassphrase('correct horse', 'another pass', FAST);
    lockVault();
    expect(await unlockWithPasskey()).toEqual([id]);
  });
});
