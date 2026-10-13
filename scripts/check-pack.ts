/**
 * 教材パックを 1 つずつ検証する（サンプル教材を作るとき・外部 AI が作った教材を確かめるとき用）。
 * 形式の検証に加えて、作り方の目安（選択肢の正解の偏り・同じ問題の重複など）も確かめる。
 *
 * 使い方:
 *   node scripts/check-pack.ts public/packs/<id>.json [...]
 *   node scripts/check-pack.ts            # public/packs のすべて（npm run packs:lint）
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { PackSchema } from '../src/lib/packs/schema.ts';

const packsDir = path.resolve(import.meta.dirname, '..', 'public', 'packs');
const args = process.argv.slice(2);
const files =
  args.length > 0
    ? args
    : readdirSync(packsDir)
        .filter((f) => f.endsWith('.json') && f !== 'index.json')
        .sort()
        .map((f) => path.join(packsDir, f));

let failed = false;
for (const file of files) {
  const errors: string[] = [];
  const warnings: string[] = [];
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`${file}: JSON として読めません: ${(e as Error).message}`);
    failed = true;
    continue;
  }
  const r = PackSchema.safeParse(raw);
  if (!r.success) {
    for (const issue of r.error.issues.slice(0, 20))
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
  } else {
    const pack = r.data;
    if (`${pack.id}.json` !== path.basename(file))
      errors.push(`ファイル名は "${pack.id}.json" にしてください`);
    const counts: Record<string, number> = {};
    const answerPos = [0, 0, 0, 0, 0, 0];
    const seenQ = new Map<string, string>();
    for (const item of pack.items) {
      counts[item.type] = (counts[item.type] ?? 0) + 1;
      const key =
        item.type === 'vocab'
          ? item.term
          : item.type === 'phrase'
            ? item.phrase
            : item.type === 'cloze'
              ? item.text
              : item.type === 'order'
                ? item.answer
                : item.type === 'truefalse'
                  ? item.statement
                  : item.type === 'match'
                    ? item.pairs.map((p) => p.left).join('|')
                    : item.question;
      const norm = `${item.type}:${key.replace(/\s+/g, '')}`;
      if (seenQ.has(norm)) warnings.push(`${item.id}: ${seenQ.get(norm)} と同じ問題です`);
      seenQ.set(norm, item.id);
      if (item.type === 'choice') {
        answerPos[item.answer]++;
        if (new Set(item.choices.map((c) => c.trim())).size !== item.choices.length)
          errors.push(`${item.id}: 選択肢が重複しています`);
      }
      if (item.type === 'cloze') {
        const blanks = [...item.text.matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => m[1]);
        if (blanks.length > 3)
          warnings.push(`${item.id}: 空欄が ${blanks.length} 個あります（3 個まで推奨）`);
        for (const b of blanks)
          if (b.length > 30)
            warnings.push(`${item.id}: 空欄の答え「${b}」が長すぎます（30 文字まで推奨）`);
      }
      if (item.type === 'multi' && item.answers.length === item.choices.length)
        warnings.push(`${item.id}: すべての選択肢が正解です（誤りの選択肢も入れてください）`);
      if (item.type === 'journal') {
        const accounts = [...item.debit, ...item.credit].map((l) => l.account);
        const extra = item.accounts ?? [];
        if (new Set([...accounts, ...extra]).size < 4)
          warnings.push(
            `${item.id}: 勘定科目の選択肢が少なすぎます（accounts で紛らわしい科目を足してください）`,
          );
      }
      if (item.type === 'table') {
        const blanks = item.rows.flat().filter((c) => /\{\{[^{}]+\}\}/.test(c)).length;
        if (blanks > 6)
          warnings.push(`${item.id}: 表の空欄が ${blanks} 個あります（6 個まで推奨）`);
      }
      if (item.type === 'qa' && item.answer.length > 60 && !item.explanation)
        warnings.push(`${item.id}: 答えが長いときは explanation で要点を補ってください`);
    }
    const choices = counts.choice ?? 0;
    if (choices >= 8) {
      const max = Math.max(...answerPos);
      if (max > choices * 0.45)
        warnings.push(`選択問題の正解の位置が偏っています（${answerPos.slice(0, 4).join(' / ')}）`);
    }
    console.log(
      `${file}: ${pack.items.length} 項目（${Object.entries(counts)
        .map(([k, v]) => `${k} ${v}`)
        .join(', ')}）${choices ? ` 正解の位置 ${answerPos.slice(0, 4).join('/')}` : ''}`,
    );
  }
  for (const e of errors) console.error(`  ✗ ${e}`);
  for (const w of warnings) console.warn(`  ! ${w}`);
  if (errors.length) failed = true;
}
process.exit(failed ? 1 : 0);
