import { beforeEach, describe, expect, it } from 'vitest';
import {
  changePassphrase,
  createVault,
  deleteKey,
  deleteVault,
  getUnlockedKey,
  isLegacyKey,
  isUnlocked,
  lockVault,
  openVault,
  saveKey,
  storedKeyInfo,
  unlockLegacyKey,
  vaultState,
  type CloudProviderId,
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
  for (const p of ['gemini', 'openai', 'anthropic', 'openrouter'] as const) deleteKey(p);
  deleteVault();
});

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));

/** 以前の形（キーごとに合言葉で暗号化）のキーを直接書く */
async function writeLegacy(provider: CloudProviderId, key: string, passphrase: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const base = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  const aes = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: FAST },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt'],
  );
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aes,
    new TextEncoder().encode(key),
  );
  localStorage.setItem(
    `lllm-study:cloud-key:${provider}`,
    JSON.stringify({
      v: 1,
      iterations: FAST,
      salt: b64(salt),
      iv: b64(iv),
      data: b64(data),
      hint: key.slice(-4),
      savedAt: 1,
    }),
  );
}

describe('keyVault（アプリの合言葉）', () => {
  it('アプリの合言葉で暗号化して保存し、キーそのものも合言葉も保存しない', async () => {
    expect(vaultState()).toBe('none');
    await createVault('correct horse', FAST);
    await saveKey('gemini', '  AIzaSyTEST-1234abcd  ', 'vault');
    const all = [...Array(localStorage.length).keys()]
      .map((i) => localStorage.getItem(localStorage.key(i)!))
      .join('\n');
    expect(all).not.toContain('AIzaSyTEST');
    expect(all).not.toContain('correct horse');
    expect(storedKeyInfo('gemini')).toMatchObject({ hint: 'abcd' });
    expect(getUnlockedKey('gemini')).toBe('AIzaSyTEST-1234abcd');
    expect(vaultState()).toBe('open');
  });

  it('1 回の合言葉で、保存したすべてのキーを解除する', async () => {
    await createVault('correct horse', FAST);
    await saveKey('gemini', 'AIza-1', 'vault');
    await saveKey('openai', 'sk-2', 'vault');
    lockVault();
    expect(vaultState()).toBe('locked');
    expect(isUnlocked('gemini')).toBe(false);
    await expect(openVault('wrong passphrase')).rejects.toThrow('合言葉が違います');
    expect(await openVault('correct horse')).toEqual(['gemini', 'openai']);
    expect(getUnlockedKey('openai')).toBe('sk-2');
  });

  it('ロック中は合言葉なしで保存できない。今回だけはどこにも保存しない', async () => {
    await createVault('correct horse', FAST);
    await saveKey('gemini', 'AIzaSyOLD-0000', 'vault');
    lockVault();
    await expect(saveKey('openai', 'sk-x', 'vault')).rejects.toThrow('解除してから');
    await saveKey('gemini', 'AIzaSyNEW-9999', 'session');
    expect(storedKeyInfo('gemini')).toBeNull();
    expect(getUnlockedKey('gemini')).toBe('AIzaSyNEW-9999');
    // 今回だけのキーはロックしても残る
    lockVault();
    expect(getUnlockedKey('gemini')).toBe('AIzaSyNEW-9999');
  });

  it('短すぎる合言葉・空のキーは受け付けない', async () => {
    await expect(createVault('short', FAST)).rejects.toThrow('8 文字以上');
    await createVault('long enough', FAST);
    await expect(saveKey('gemini', '   ', 'vault')).rejects.toThrow('API キー');
  });

  it('合言葉を変えると、保存したキーを新しい合言葉で暗号化し直す', async () => {
    await createVault('correct horse', FAST);
    await saveKey('gemini', 'AIza-1', 'vault');
    await changePassphrase('new passphrase', FAST);
    lockVault();
    await expect(openVault('correct horse')).rejects.toThrow('合言葉が違います');
    expect(await openVault('new passphrase')).toEqual(['gemini']);
  });

  it('以前の形のキーは、その合言葉で解除するとアプリの合言葉の形に移す', async () => {
    await writeLegacy('gemini', 'AIza-old', 'same-pass-1');
    await writeLegacy('openai', 'sk-old', 'same-pass-1');
    await writeLegacy('anthropic', 'sk-ant-old', 'other-pass-2');
    expect(vaultState()).toBe('locked');
    // アプリの合言葉がまだないときは、解除できた合言葉をアプリの合言葉にする
    expect(await openVault('same-pass-1')).toEqual(['gemini', 'openai']);
    expect(isLegacyKey('gemini')).toBe(false);
    expect(isLegacyKey('anthropic')).toBe(true);
    // 別の合言葉のキーは、その合言葉で解除するとそろう
    await unlockLegacyKey('anthropic', 'other-pass-2');
    expect(isLegacyKey('anthropic')).toBe(false);
    lockVault();
    expect(await openVault('same-pass-1')).toEqual(['gemini', 'openai', 'anthropic']);
    expect(getUnlockedKey('anthropic')).toBe('sk-ant-old');
  });

  it('削除すると保存もメモリーも消える', async () => {
    await createVault('correct horse', FAST);
    await saveKey('gemini', 'AIzaSyTEST-1234abcd', 'vault');
    deleteKey('gemini');
    expect(storedKeyInfo('gemini')).toBeNull();
    expect(isUnlocked('gemini')).toBe(false);
  });
});
