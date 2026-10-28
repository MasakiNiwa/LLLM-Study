import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  callbackUrl,
  canLoginHere,
  createCodeChallenge,
  handleOpenRouterCallback,
} from './openrouterAuth';

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => void store.set(k, String(v)),
    removeItem: (k) => void store.delete(k),
    clear: () => store.clear(),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

const replaceState = vi.fn();

function setUrl(href: string) {
  vi.stubGlobal('location', new URL(href));
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.stubGlobal('sessionStorage', memoryStorage());
  vi.stubGlobal('history', { replaceState });
  replaceState.mockClear();
});

const save = (createdAt = Date.now()) =>
  sessionStorage.setItem(
    'lllm-study:openrouter-pkce',
    JSON.stringify({ verifier: 'VERIFIER', createdAt }),
  );

describe('OpenRouter でログイン', () => {
  it('code_challenge は code_verifier の SHA-256 を base64url にしたもの', async () => {
    const verifier = 'dBjftJeZ4CVP-mJ92K1-BAPmGmw0Ym0qrALkUf7FjS4';
    // 期待値は Node の crypto（createHash('sha256').digest('base64url')）で計算したもの
    expect(await createCodeChallenge(verifier)).toBe('xwg2lD5ykUdT7A7ClQWBaQ_3UbC7S831KaQFv_kvsM0');
  });

  it('戻り先はハッシュを除いたアプリの URL。https か localhost でだけログインできる', () => {
    expect(callbackUrl({ origin: 'https://masakiniwa.github.io', pathname: '/LLLM-Study/' })).toBe(
      'https://masakiniwa.github.io/LLLM-Study/',
    );
    expect(canLoginHere({ protocol: 'https:', hostname: 'masakiniwa.github.io' })).toBe(true);
    expect(canLoginHere({ protocol: 'http:', hostname: 'localhost' })).toBe(true);
    expect(canLoginHere({ protocol: 'http:', hostname: '192.168.0.2' })).toBe(false);
  });

  it('このタブで始めたログインの code だけをキーと交換し、URL から code を消す', async () => {
    setUrl('https://masakiniwa.github.io/LLLM-Study/?code=ABC');
    save();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ key: 'sk-or-NEW' })));
    const r = await handleOpenRouterCallback(fetchMock);
    expect(r).toEqual({ status: 'success', key: 'sk-or-NEW' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/auth/keys');
    expect(JSON.parse(init.body as string)).toEqual({
      code: 'ABC',
      code_verifier: 'VERIFIER',
      code_challenge_method: 'S256',
    });
    expect(replaceState).toHaveBeenCalledWith(null, '', '/LLLM-Study/');
    // 二度は使えない
    expect(sessionStorage.getItem('lllm-study:openrouter-pkce')).toBeNull();
  });

  it('始めていないログインの code には触らない。期限切れは知らせる', async () => {
    setUrl('https://masakiniwa.github.io/LLLM-Study/?code=ABC');
    const fetchMock = vi.fn();
    expect(await handleOpenRouterCallback(fetchMock)).toEqual({ status: 'none' });
    expect(replaceState).not.toHaveBeenCalled();

    save(Date.now() - 60 * 60 * 1000);
    const r = await handleOpenRouterCallback(fetchMock);
    expect(r.status).toBe('error');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
