/**
 * 本番ビルドの index.html に Content Security Policy（<meta http-equiv>）を入れる。
 *
 * GitHub Pages では HTTP ヘッダーを設定できないため、meta で指定する。
 * いちばんの目的は connect-src: ページから通信できる先を、クラウド AI の API とモデルの入手元だけに絞ること。
 * 万一ページに悪いスクリプトが入り込んでも、API キーや学習データを外部に送り出せないようにする。
 * インラインの <script>（初回描画前にテーマを当てるもの）は、その内容のハッシュだけを許可する。
 *
 * 開発サーバー（vite dev）は HMR がインラインのスクリプトを使うので、本番ビルドだけに入れる。
 * 送信先を増やすときは CONNECT_SOURCES に足す（docs/CLOUD_AI.md）。
 */
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/** ページから通信してよい先（同じオリジンのほか） */
export const CONNECT_SOURCES = [
  // クラウド AI: Gemini API・OpenAI API・Claude（Anthropic API）・OpenRouter（ログインのキー交換も）
  'https://generativelanguage.googleapis.com',
  'https://api.openai.com',
  'https://api.anthropic.com',
  'https://openrouter.ai',
  // モデルの入手元（ダウンロードは Worker で行うが、Worker にもページのポリシーを当てるブラウザがあるため）
  'https://huggingface.co',
  'https://*.huggingface.co',
  'https://*.hf.co',
];

/** インラインの <script>（src のないもの）の中身 */
export function inlineScripts(html: string): string[] {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

export function sha256(text: string): string {
  return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

export function buildCsp(scriptHashes: string[]): string {
  const directives: Record<string, string[]> = {
    'default-src': ["'self'"],
    // Wasm（LiteRT-LM）のコンパイルには wasm-unsafe-eval が要る（eval 自体は許可しない）
    'script-src': ["'self'", ...scriptHashes, "'wasm-unsafe-eval'"],
    // 通知（sonner）などが <style> を差し込むため、スタイルだけはインラインを許可する
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:'],
    'media-src': ["'self'", 'data:', 'blob:'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...CONNECT_SOURCES],
    'worker-src': ["'self'", 'blob:'],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(' ')}`)
    .join('; ');
}

export function cspPlugin(): Plugin {
  return {
    name: 'lllm-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const csp = buildCsp(inlineScripts(html).map(sha256));
        // charset の直後（ほかのどの要素よりも前）に置く
        return html.replace(
          /(<meta charset="[^"]*"\s*\/?>)/i,
          `$1\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`,
        );
      },
    },
  };
}
