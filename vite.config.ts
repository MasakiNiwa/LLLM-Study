import { readFileSync } from 'node:fs';
import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import {
  litertlmWasm,
  LITERTLM_VERSION,
  LITERTLM_WASM_DIR,
} from './build/vite-plugin-litertlm-wasm.ts';

const appPkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

// https://vite.dev/config/
export default defineConfig({
  // 相対 base: GitHub Pages のサブパス（/Try-Local/）でもフォークでもそのまま動く
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    litertlmWasm(),
    VitePWA({
      // 生成中・ダウンロード中に勝手にリロードしないよう、更新はユーザーが選ぶ
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        // アプリを見分ける ID（変えると別のアプリとして扱われるので、今後は変えない）
        id: 'lllm-study',
        name: 'LLLM Study',
        short_name: 'LLLM Study',
        description: '自分のペースで使えるローカルLLMタイプの学習アプリ',
        lang: 'ja',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#4f46e5',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // アプリシェルはプリキャッシュ。Wasm（1 ファイル 20〜35MB）は実際に使う 1 種類だけを実行時にキャッシュ
        globPatterns: ['**/*.{js,css,html,svg,png}'],
        globIgnores: ['litertlm-wasm/**', 'packs/**', 'schema/**'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/litertlm-wasm/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'litertlm-wasm',
              expiration: { maxEntries: 6 },
              cacheableResponse: { statuses: [200] },
            },
          },
          {
            // ライセンス一覧・サンプル教材・教材の JSON Schema（更新されうるので裏で取り直す）
            urlPattern: ({ url }) =>
              url.pathname.endsWith('/licenses.json') ||
              url.pathname.includes('/packs/') ||
              url.pathname.includes('/schema/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'app-data', expiration: { maxEntries: 100 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  define: {
    __APP_VERSION__: JSON.stringify(appPkg.version),
    __LITERTLM_VERSION__: JSON.stringify(LITERTLM_VERSION),
    __LITERTLM_WASM_DIR__: JSON.stringify(LITERTLM_WASM_DIR),
  },
  worker: {
    // LiteRT-LM の Wasm ローダーは importScripts() を使うため classic worker が必要
    format: 'iife',
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
  },
});
