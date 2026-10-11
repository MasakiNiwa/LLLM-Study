/**
 * 外部 AI の出力（JSON）を教材パックとして読み取る。
 *
 * AI はよく ```json のコードブロックや前置きの文章を付けて返すので、
 * そこから JSON 部分を取り出してから検証する。
 */
import { PackSchema, type StudyPack } from './schema.ts';

export interface PackIssue {
  /** 例: items[3].meanings */
  path: string;
  message: string;
}

export type ParseResult =
  | { ok: true; pack: StudyPack; warnings: string[] }
  | { ok: false; error: string; issues: PackIssue[] };

/** テキストから JSON の候補を取り出す */
export function extractJson(text: string): string {
  const trimmed = text.trim().replace(/^\uFEFF/, '');
  // ```json ... ``` のコードブロック（複数あれば一番長いもの）
  const fences = [...trimmed.matchAll(/```(?:json|JSON)?\s*\n([\s\S]*?)```/g)].map((m) => m[1]);
  if (fences.length > 0) return fences.sort((a, b) => b.length - a.length)[0].trim();
  if (trimmed.startsWith('[')) return trimmed;
  // 前後に文章がある場合は最初の { から最後の } まで
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function formatPath(path: readonly PropertyKey[]): string {
  return path
    .map((p, i) => (typeof p === 'number' ? `[${p}]` : i === 0 ? String(p) : `.${String(p)}`))
    .join('');
}

/** AI が付けがちな「最後の要素の後ろのカンマ」を取り除く（文字列の中は触らない） */
function removeTrailingCommas(json: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < json.length; i++) {
    const c = json[i];
    if (inString) {
      out += c;
      if (c === '\\') {
        out += json[++i] ?? '';
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      out += c;
      continue;
    }
    if (c === ',') {
      const rest = json.slice(i + 1).match(/^\s*([}\]])/);
      if (rest) continue;
    }
    out += c;
  }
  return out;
}

export function parsePackText(text: string): ParseResult {
  if (!text.trim()) return { ok: false, error: 'テキストが空です', issues: [] };
  const json = extractJson(text);
  const warnings: string[] = [];
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    try {
      data = JSON.parse(removeTrailingCommas(json));
      warnings.push('JSON の末尾の余分なカンマを取り除いて読み込みました');
    } catch (e) {
      return {
        ok: false,
        error: `JSON として読み取れませんでした（${e instanceof Error ? e.message : String(e)}）`,
        issues: [],
      };
    }
  }
  // 項目の配列だけが渡された場合は教えてあげる
  if (Array.isArray(data)) {
    return {
      ok: false,
      error:
        '項目の配列だけが渡されました。"format": "lllm-study-pack" を含むパック全体の JSON を貼り付けてください',
      issues: [],
    };
  }
  const result = PackSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues.slice(0, 50).map((i) => ({
      path: formatPath(i.path),
      message: i.message,
    }));
    return {
      ok: false,
      error: `教材パックの形式に合っていない箇所が ${result.error.issues.length} 件あります`,
      issues,
    };
  }
  return { ok: true, pack: result.data, warnings };
}
