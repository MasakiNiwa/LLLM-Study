/**
 * 「OpenRouter でログイン」（OAuth PKCE）。サーバーなしで、ユーザー自身の API キーを受け取る。
 * キーを貼り付けなくてよいので、スマホでも登録しやすい。
 *
 * 1. code_verifier を作ってこのタブの sessionStorage に置き、OpenRouter の認可ページへ移動する
 * 2. 戻ってきた URL の ?code= と code_verifier を送り、API キーを受け取る
 * 受け取ったキーは保存せず、合言葉を決めてもらってから暗号化して保存する（keyVault の holdPendingKey）
 */
import { STORAGE_PREFIX } from '@/lib/constants';
import { OPENROUTER_ORIGIN } from './openrouter';

const AUTH_URL = `${OPENROUTER_ORIGIN}/auth`;
const KEY_URL = `${OPENROUTER_ORIGIN}/api/v1/auth/keys`;
const STORAGE_KEY = `${STORAGE_PREFIX}:openrouter-pkce`;
/** 認可ページから戻るまでの有効期限 */
const PKCE_TTL_MS = 15 * 60 * 1000;

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function createCodeVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64url(new Uint8Array(digest));
}

/** 戻り先。ハッシュ（#/models など）と検索部分を除いたアプリの URL */
export function callbackUrl(loc: Pick<Location, 'origin' | 'pathname'> = location): string {
  return `${loc.origin}${loc.pathname}`;
}

/** https か localhost でないと OpenRouter が戻り先として受け付けない */
export function canLoginHere(loc: Pick<Location, 'protocol' | 'hostname'> = location): boolean {
  return loc.protocol === 'https:' || loc.hostname === 'localhost' || loc.hostname === '127.0.0.1';
}

/** 認可ページへ移動する（戻ってくると handleOpenRouterCallback が処理する） */
export async function startOpenRouterLogin(): Promise<void> {
  const verifier = createCodeVerifier();
  const challenge = await createCodeChallenge(verifier);
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ verifier, createdAt: Date.now() }));
  const params = new URLSearchParams({
    callback_url: callbackUrl(),
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });
  location.assign(`${AUTH_URL}?${params}`);
}

export type CallbackResult =
  { status: 'none' } | { status: 'success'; key: string } | { status: 'error'; message: string };

function readSaved(): { verifier?: string; createdAt?: number } | null {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as {
      verifier?: string;
      createdAt?: number;
    } | null;
  } catch {
    return null;
  }
}

/**
 * 起動時に呼ぶ。URL に ?code= があり、このタブで始めたログインなら API キーと交換する。
 * 処理したら URL から code を消す（画面の移動は呼び出し側で行う）。
 */
export async function handleOpenRouterCallback(
  fetchImpl: typeof fetch = fetch,
): Promise<CallbackResult> {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  if (!code) return { status: 'none' };

  const saved = readSaved();
  // このタブで始めたログインでなければ触らない
  if (!saved?.verifier) return { status: 'none' };

  sessionStorage.removeItem(STORAGE_KEY);
  url.searchParams.delete('code');
  // 再読み込みで二重に使わないよう、code を消してから交換する
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);

  if (!saved.createdAt || Date.now() - saved.createdAt > PKCE_TTL_MS)
    return { status: 'error', message: 'ログインの有効期限が切れました。もう一度お試しください。' };

  try {
    const res = await fetchImpl(KEY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: saved.verifier,
        code_challenge_method: 'S256',
      }),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const json = (await res.json()) as { key?: unknown };
    if (typeof json.key !== 'string' || !json.key) throw new Error('キーがありません');
    return { status: 'success', key: json.key };
  } catch (e) {
    return {
      status: 'error',
      message: `OpenRouter のログインに失敗しました（${e instanceof Error ? e.message : String(e)}）。もう一度お試しください。`,
    };
  }
}
