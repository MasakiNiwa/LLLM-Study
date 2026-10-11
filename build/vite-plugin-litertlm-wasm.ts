import { createReadStream, readdirSync, statSync } from 'node:fs';
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';

const require = createRequire(import.meta.url);

/** @litert-lm/core のバージョン */
export const LITERTLM_VERSION: string = require('@litert-lm/core/package.json').version;

/**
 * 配信先ディレクトリ（アプリの base からの相対パス）。
 * バージョンをパスに含めることで、更新時に古いキャッシュと混ざらないようにする。
 */
export const LITERTLM_WASM_DIR = `litertlm-wasm/${LITERTLM_VERSION}`;

/** node_modules/@litert-lm/core/wasm の絶対パス */
function resolveWasmSourceDir(): string {
  const pkgJson = require.resolve('@litert-lm/core/package.json');
  return path.join(path.dirname(pkgJson), 'wasm');
}

/**
 * LiteRT-LM の Wasm ランタイム（.js / .wasm）を npm パッケージから
 * 自サイトにセルフホストするためのプラグイン。
 *
 * - dev: `/<base>/litertlm-wasm/<version>/*` を node_modules から直接配信
 * - build: `dist/litertlm-wasm/<version>/` へコピー
 *
 * バージョンは package.json に固定した @litert-lm/core と常に一致する。
 */
export function litertlmWasm(): Plugin {
  const srcDir = resolveWasmSourceDir();
  let config: ResolvedConfig;

  return {
    name: 'lllm-study:litertlm-wasm',
    configResolved(resolved) {
      config = resolved;
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] ?? '';
        const marker = `/${LITERTLM_WASM_DIR}/`;
        const idx = url.indexOf(marker);
        if (idx < 0) return next();
        const name = path.basename(url.slice(idx + marker.length));
        const file = path.join(srcDir, name);
        try {
          const st = statSync(file);
          res.setHeader('Content-Length', st.size);
          res.setHeader(
            'Content-Type',
            name.endsWith('.wasm') ? 'application/wasm' : 'text/javascript',
          );
          createReadStream(file).pipe(res);
        } catch {
          next();
        }
      });
    },
    async writeBundle() {
      if (config.command !== 'build') return;
      const outDir = path.resolve(config.root, config.build.outDir, LITERTLM_WASM_DIR);
      await mkdir(outDir, { recursive: true });
      for (const name of readdirSync(srcDir)) {
        await copyFile(path.join(srcDir, name), path.join(outDir, name));
      }
    },
  };
}
