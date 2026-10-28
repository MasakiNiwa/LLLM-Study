import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  deleteKey,
  getUnlockedKey,
  isUnlocked,
  lockKey,
  saveKey,
  storedKeyInfo,
  unlockKey,
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
  deleteKey('gemini');
});

describe('keyVault', () => {
  it('合言葉で暗号化して保存し、キーそのものは保存しない', async () => {
    await saveKey('gemini', '  AIzaSyTEST-1234abcd  ', 'correct horse', FAST);
    const raw = localStorage.getItem('lllm-study:cloud-key:gemini') ?? '';
    expect(raw).not.toContain('AIzaSyTEST');
    expect(raw).not.toContain('correct horse');
    expect(storedKeyInfo('gemini')).toMatchObject({ hint: 'abcd' });
    // 登録した直後は解除済み
    expect(getUnlockedKey('gemini')).toBe('AIzaSyTEST-1234abcd');
  });

  it('ロックするとメモリーから消え、正しい合言葉でだけ解除できる', async () => {
    await saveKey('gemini', 'AIzaSyTEST-1234abcd', 'correct horse', FAST);
    lockKey('gemini');
    expect(isUnlocked('gemini')).toBe(false);
    await expect(unlockKey('gemini', 'wrong passphrase')).rejects.toThrow('合言葉が違います');
    expect(isUnlocked('gemini')).toBe(false);
    await unlockKey('gemini', 'correct horse');
    expect(getUnlockedKey('gemini')).toBe('AIzaSyTEST-1234abcd');
  });

  it('今回だけはどこにも保存しない（以前に保存した暗号文も消す）', async () => {
    await saveKey('gemini', 'AIzaSyOLD-0000', 'correct horse', FAST);
    await saveKey('gemini', 'AIzaSyNEW-9999', null);
    expect(storedKeyInfo('gemini')).toBeNull();
    expect(getUnlockedKey('gemini')).toBe('AIzaSyNEW-9999');
  });

  it('短すぎる合言葉・空のキーは受け付けない', async () => {
    await expect(saveKey('gemini', 'k', 'short', FAST)).rejects.toThrow('8 文字以上');
    await expect(saveKey('gemini', '   ', 'long enough', FAST)).rejects.toThrow('API キー');
  });

  it('削除すると保存もメモリーも消える', async () => {
    await saveKey('gemini', 'AIzaSyTEST-1234abcd', 'correct horse', FAST);
    deleteKey('gemini');
    expect(storedKeyInfo('gemini')).toBeNull();
    expect(isUnlocked('gemini')).toBe(false);
  });
});

describe('同じ合言葉のキーをまとめて解除する', () => {
  it('同じ合言葉で保存したほかの接続先も解除し、違う合言葉のものはロックのまま', async () => {
    const { useCloud } = await import('@/features/cloud/cloudStore');
    await saveKey('gemini', 'AIza-1', 'same-pass-1', FAST);
    await saveKey('openai', 'sk-2', 'same-pass-1', FAST);
    await saveKey('anthropic', 'sk-ant-3', 'other-pass-2', FAST);
    for (const p of ['gemini', 'openai', 'anthropic'] as const) lockKey(p);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 500 })),
    );
    const also = await useCloud.getState().unlock('gemini', 'same-pass-1');
    expect(also).toEqual(['openai']);
    expect(getUnlockedKey('openai')).toBe('sk-2');
    expect(isUnlocked('anthropic')).toBe(false);
    vi.unstubAllGlobals();
    deleteKey('openai');
    deleteKey('anthropic');
  });
});
