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

// 一覧の並び（おすすめ順）: 分野のまとまりごとに、学ぶ順（易しい → 難しい）に並べる。
// ここにない教材は、同じ分野の最後（分野も知らなければ一覧の最後）に、ファイル名の順で入る
const RECOMMENDED_ORDER = [
  // 英語: 単語 → 文法 → 表現 → 読解 → 実践
  'en-core-verbs',
  'en-vocab-junior-150',
  'en-daily-phrases',
  'en-grammar-check',
  'en-grammar-junior-100',
  'en-phrasal-verbs',
  'en-vocab-high-150',
  'en-grammar-high-100',
  'en-collocations-100',
  'en-reading-basic',
  'en-travel-phrases-100',
  'en-idioms-80',
  'en-vocab-advanced-150',
  'en-reading-intermediate-40',
  'en-business-phrases-100',
  'en-toeic-part5-100',
  // 外国語・国語
  'zh-basics-120',
  'ko-basics-120',
  'es-basics-100',
  'ja-kanji-reading-120',
  'ja-idioms-proverbs-120',
  // 数学・理科
  'math-elementary-review-80',
  'math-middle-school',
  'math-high-1a-100',
  'math-statistics-80',
  'math-spi-80',
  'science-chemistry-basics',
  'science-physics-basics-80',
  'science-biology-basics-80',
  'science-earth-80',
  // 社会
  'ja-history-timeline',
  'world-history-100',
  'world-geography',
  'ja-geography-100',
  'civics-politics-economy-100',
  'law-everyday-80',
  // IT・プログラミング
  'it-basics',
  'it-passport-120',
  'it-ai-data-literacy-80',
  'it-fe-basics-120',
  'programming-python-100',
  'programming-javascript-100',
  'programming-sql-80',
  'it-git-linux-100',
  // ビジネス・お金
  'business-manners',
  'business-logical-thinking-60',
  'money-basics-100',
  'business-marketing-80',
  'ja-bookkeeping-accounts-001',
  'business-financial-statements-80',
  // 経理実務マスター（会計の論点別）: 日々の決算 → 主要な基準 → 税務 → 連結
  'acct-closing-practice-80',
  'acct-fixed-assets-80',
  'acct-financial-instruments-80',
  'acct-provisions-retirement-80',
  'acct-foreign-currency-60',
  'acct-revenue-100',
  'acct-lease-100',
  'acct-impairment-80',
  'acct-tax-effect-80',
  'acct-consumption-tax-80',
  'acct-corporate-tax-80',
  'acct-consolidation-100',
];
const rank = (e: SampleIndexEntry) => {
  const i = RECOMMENDED_ORDER.indexOf(e.id);
  if (i >= 0) return i;
  // 同じ分野の教材のうち、おすすめ順で最後のものの後ろ
  const last = RECOMMENDED_ORDER.findLastIndex(
    (id) => entries.find((x) => x.id === id)?.subject === e.subject,
  );
  return last >= 0 ? last + 0.5 : RECOMMENDED_ORDER.length;
};
entries.sort((a, b) => rank(a) - rank(b) || a.file.localeCompare(b.file));

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
