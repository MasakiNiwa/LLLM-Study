/**
 * サンプル教材（public/packs/*.json）を検証し、一覧と仕様書を生成する。
 *
 * 出力:
 *   - public/packs/index.json                 … アプリが読むサンプル教材の一覧
 *   - public/schema/study-pack.v1.schema.json … 教材パックの JSON Schema
 *   - docs/STUDY_PACK_FORMAT.md               … 教材パック形式の仕様書
 *
 * 使い方:
 *   node scripts/build-packs.ts          # 生成
 *   node scripts/build-packs.ts --check  # 検証のみ（生成物が最新か。CI 用）
 *
 * サンプル教材を追加するときは public/packs/ に <パックの id>.json を置いて実行する。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PackSchema, packJsonSchema } from '../src/lib/packs/schema.ts';
import { buildSpecMarkdown } from '../src/lib/packs/spec.ts';

const root = path.resolve(import.meta.dirname, '..');
const packsDir = path.join(root, 'public', 'packs');
const checkMode = process.argv.includes('--check');

interface SampleIndexEntry {
  file: string;
  id: string;
  title: string;
  description?: string;
  subject?: string;
  level?: string;
  tags?: string[];
  revision: number;
  itemCount: number;
  itemTypes: string[];
}

const errors: string[] = [];
const entries: SampleIndexEntry[] = [];

for (const file of readdirSync(packsDir)
  .filter((f) => f.endsWith('.json') && f !== 'index.json')
  .sort()) {
  const raw = JSON.parse(readFileSync(path.join(packsDir, file), 'utf8'));
  const result = PackSchema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues.slice(0, 10)) {
      errors.push(`${file}: ${issue.path.join('.')}: ${issue.message}`);
    }
    continue;
  }
  const pack = result.data;
  if (`${pack.id}.json` !== file)
    errors.push(`${file}: ファイル名は "${pack.id}.json" にしてください`);
  entries.push({
    file,
    id: pack.id,
    title: pack.title,
    description: pack.description,
    subject: pack.subject,
    level: pack.level,
    tags: pack.tags,
    revision: pack.revision ?? 1,
    itemCount: pack.items.length,
    itemTypes: [...new Set(pack.items.map((i) => i.type))],
  });
}

// 一覧の並び（おすすめ順）: 分野ごとにまとめる。ここにない分野は後ろへ、同じ分野の中はファイル名の順
const SUBJECT_ORDER = [
  'english',
  'business',
  'it',
  'history',
  'geography',
  'science',
  'math',
  'bookkeeping',
];
const rank = (subject?: string) => {
  const i = SUBJECT_ORDER.indexOf(subject?.toLowerCase() ?? '');
  return i < 0 ? SUBJECT_ORDER.length : i;
};
entries.sort((a, b) => rank(a.subject) - rank(b.subject) || a.file.localeCompare(b.file));

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

const outputs: [string, string][] = [
  [
    path.join(packsDir, 'index.json'),
    `${JSON.stringify({ version: 1, packs: entries }, null, 2)}\n`,
  ],
  [
    path.join(root, 'public', 'schema', 'study-pack.v1.schema.json'),
    `${JSON.stringify(packJsonSchema(), null, 2)}\n`,
  ],
  [path.join(root, 'docs', 'STUDY_PACK_FORMAT.md'), buildSpecMarkdown()],
];

if (checkMode) {
  const stale = outputs.filter(
    ([p, content]) => !existsSync(p) || readFileSync(p, 'utf8') !== content,
  );
  if (stale.length > 0) {
    console.error(
      `Out of date: ${stale.map(([p]) => path.relative(root, p)).join(', ')}. Run \`npm run packs\` and commit.`,
    );
    process.exit(1);
  }
  console.log(
    `Sample packs are valid and generated files are up to date (${entries.length} packs).`,
  );
} else {
  for (const [p, content] of outputs) {
    mkdirSync(path.dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  console.log(`Validated ${entries.length} sample packs and wrote index, schema and spec.`);
}
