#!/usr/bin/env node
/**
 * 本番依存（package.json の dependencies を再帰的にたどったもの）のライセンス情報を収集する。
 *
 * 出力:
 *   - public/licenses.json      … ヘルプページで表示する全文入りデータ（ビルド時生成・git 管理外）
 *   - THIRD_PARTY_NOTICES.md    … リポジトリで管理する一覧（`--check` で最新か検証）
 *
 * 使い方:
 *   node scripts/generate-licenses.mjs          # 生成
 *   node scripts/generate-licenses.mjs --check  # THIRD_PARTY_NOTICES.md が最新か検証（CI 用）
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checkMode = process.argv.includes('--check');

const LICENSE_FILE_RE = /^(licen[cs]e|copying|notice)(\.|-|$)/i;
const FALLBACK_TEXT_DIR = path.join(root, 'scripts', 'license-texts');

/** node の解決規則に従ってパッケージディレクトリを探す */
function findPackageDir(name, fromDir) {
  let dir = fromDir;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', name);
    if (existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function normalizeRepo(repo) {
  if (!repo) return undefined;
  let url = typeof repo === 'string' ? repo : repo.url;
  if (!url) return undefined;
  url = url
    .replace(/^git\+/, '')
    .replace(/\.git$/, '')
    .replace(/^git:\/\//, 'https://');
  if (/^[\w-]+\/[\w.-]+$/.test(url)) url = `https://github.com/${url}`;
  if (url.startsWith('github:')) url = `https://github.com/${url.slice(7)}`;
  return url;
}

function licenseString(pkg) {
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((l) => l.type ?? l).join(' OR ');
  return 'UNKNOWN';
}

function readLicenseTexts(dir, license) {
  const files = readdirSync(dir)
    .filter((f) => LICENSE_FILE_RE.test(f))
    .sort();
  const texts = files.map((f) => ({
    file: f,
    text: readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim(),
  }));
  if (texts.length === 0) {
    // パッケージにライセンス文が同梱されていない場合は SPDX の標準文を添付する
    const fallback = path.join(FALLBACK_TEXT_DIR, `${license}.txt`);
    if (existsSync(fallback)) {
      texts.push({
        file: `${license} (standard text; not bundled in package)`,
        text: readFileSync(fallback, 'utf8').trim(),
      });
    }
  }
  return texts;
}

/**
 * devDependencies だが成果物に同梱されるもの。
 * vite-plugin-pwa が生成する Service Worker には Workbox のランタイムが含まれる。
 */
const BUNDLED_DEV_PACKAGES = [
  'workbox-cacheable-response',
  'workbox-core',
  'workbox-expiration',
  'workbox-precaching',
  'workbox-routing',
  'workbox-strategies',
  'workbox-window',
];

const rootPkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const seen = new Map();
const queue = [
  ...Object.keys(rootPkg.dependencies ?? {}).map((name) => ({ name, from: root, direct: true })),
  ...BUNDLED_DEV_PACKAGES.map((name) => ({ name, from: root, direct: false })),
];

while (queue.length > 0) {
  const { name, from, direct = false } = queue.shift();
  const dir = findPackageDir(name, from);
  if (!dir) {
    // optional な依存などで未インストールのものはスキップ
    continue;
  }
  const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) continue;
  const license = licenseString(pkg);
  seen.set(key, {
    name: pkg.name,
    version: pkg.version,
    license,
    repository: normalizeRepo(pkg.repository) ?? pkg.homepage,
    author: typeof pkg.author === 'string' ? pkg.author : pkg.author?.name,
    direct,
    texts: readLicenseTexts(dir, license),
  });
  for (const dep of Object.keys(pkg.dependencies ?? {})) {
    queue.push({ name: dep, from: dir });
  }
}

const packages = [...seen.values()].sort(
  (a, b) => Number(b.direct) - Number(a.direct) || a.name.localeCompare(b.name),
);

const missing = packages.filter((p) => p.texts.length === 0);

// ---- THIRD_PARTY_NOTICES.md ----
const md = [
  '# Third-Party Notices',
  '',
  'ローカルLLM学習アプリ（LLLM-Study）は以下のオープンソースソフトウェアを利用しています。',
  '各ライセンスの全文はアプリの「ヘルプ」ページ、または各パッケージのリポジトリで確認できます。',
  '',
  '> このファイルは `npm run licenses` で自動生成されます。手で編集しないでください。',
  '',
  '| Package | Version | License | Repository |',
  '| --- | --- | --- | --- |',
  ...packages.map(
    (p) =>
      `| ${p.direct ? `**${p.name}**` : p.name} | ${p.version} | ${p.license} | ${p.repository ?? ''} |`,
  ),
  '',
  '**太字** は直接依存しているパッケージです。',
  '',
].join('\n');

const mdPath = path.join(root, 'THIRD_PARTY_NOTICES.md');

if (checkMode) {
  if (missing.length > 0) {
    console.error(
      `No license text for: ${missing.map((p) => `${p.name}@${p.version}`).join(', ')}. ` +
        'Add a standard text to scripts/license-texts/<SPDX>.txt.',
    );
    process.exit(1);
  }
  const current = existsSync(mdPath) ? readFileSync(mdPath, 'utf8') : '';
  if (current !== md) {
    console.error('THIRD_PARTY_NOTICES.md is out of date. Run `npm run licenses` and commit it.');
    process.exit(1);
  }
  console.log(`THIRD_PARTY_NOTICES.md is up to date (${packages.length} packages).`);
  process.exit(0);
}

writeFileSync(mdPath, md);
mkdirSync(path.join(root, 'public'), { recursive: true });
writeFileSync(
  path.join(root, 'public', 'licenses.json'),
  JSON.stringify({ generatedFrom: 'package-lock', packages }),
);
console.log(`Collected licenses for ${packages.length} packages.`);
if (missing.length > 0) {
  console.warn(
    `WARNING: no license text found for: ${missing.map((p) => `${p.name}@${p.version}`).join(', ')}`,
  );
}
