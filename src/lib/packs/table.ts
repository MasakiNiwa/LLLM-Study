/**
 * 表（CSV・TSV）から教材パックを作る。
 * Excel・Google スプレッドシート・Anki・Quizlet などで作った単語リストをそのまま取り込めるようにする。
 * 1 列目が問題（見出し語）、2 列目が答え（意味）、3 列目があれば補足・解説。
 */
import { PACK_FORMAT, PACK_VERSION, PackSchema, type StudyItem, type StudyPack } from './schema';
import type { ParseResult } from './parse';

export type TableItemType = 'vocab' | 'qa';

export interface TableOptions {
  type: TableItemType;
  title: string;
  /** 1 行目が見出し（列名）なら true */
  header: boolean;
  /** 学ぶ言語（単語のとき。読み上げに使う） */
  targetLang?: string;
}

/** 区切り文字を推測する（タブがあればタブ、なければカンマ） */
export function detectDelimiter(text: string): '\t' | ',' {
  return text.includes('\t') ? '\t' : ',';
}

/** CSV・TSV を行と列に分ける（ダブルクォートで囲んだ値の中の区切り・改行・"" に対応） */
export function parseTable(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  rows.push(row);
  return (
    rows
      .map((r) => r.map(cleanCell))
      // 空行と、Anki の書き出しに付く「#separator:tab」などの設定行は飛ばす
      .filter((r) => r.some((c) => c !== '') && !/^#[a-z ]+:/i.test(r[0] ?? ''))
  );
}

/** セルの HTML（Anki の書き出しなど）を取り除いて整える */
function cleanCell(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();
}

/** 文字列から短い ID 用のハッシュを作る（同じ内容なら同じ ID になり、取り込み直しで記録を引き継げる） */
export function shortHash(text: string): string {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** 意味の列を「;」「；」「|」で分ける（1 つの意味の中の「、」はそのまま） */
function splitMeanings(value: string): string[] {
  return value
    .split(/\s*[;；|]\s*/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
}

/** 表を教材パックにする。検証結果は JSON の取り込みと同じ形で返す */
export function tableToPack(rows: string[][], options: TableOptions): ParseResult {
  const first = options.header ? 1 : 0;
  // 表の何行目か（1 始まり）を覚えておき、エラーの場所を行で示す
  const usable = rows
    .map((r, i) => ({ r, line: i + 1 }))
    .slice(first)
    .filter(({ r }) => (r[0] ?? '') !== '' && (r[1] ?? '') !== '');
  const skipped = rows.length - first - usable.length;
  const lines = usable.map((u) => u.line);
  const used = new Map<string, number>();
  const items: StudyItem[] = usable.map(({ r }) => {
    const [front, back, extra] = r;
    // 同じ問題が何度か出てくるときは番号を付けて区別する
    const base = `${options.type === 'vocab' ? 'v' : 'q'}-${shortHash(front)}`;
    const n = (used.get(base) ?? 0) + 1;
    used.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;
    if (options.type === 'vocab') {
      const meanings = splitMeanings(back);
      return {
        id,
        type: 'vocab',
        term: front,
        meanings: meanings.length ? meanings : [back],
        ...(extra ? { notes: extra } : {}),
      };
    }
    return {
      id,
      type: 'qa',
      question: front,
      answer: back,
      ...(extra ? { explanation: extra } : {}),
    };
  });
  const title = options.title.trim() || '取り込んだ表';
  const pack = {
    format: PACK_FORMAT,
    version: PACK_VERSION,
    id: `table-${shortHash(title)}`,
    title,
    source: '表（CSV・TSV）から取り込み',
    ...(options.type === 'vocab' && options.targetLang
      ? { language: { target: options.targetLang, explanation: 'ja' } }
      : {}),
    items,
  };
  if (items.length === 0) {
    return {
      ok: false,
      error: '取り込める行がありません（1 列目と 2 列目が必要です）',
      issues: [],
    };
  }
  const result = PackSchema.safeParse(pack);
  if (!result.success) {
    return {
      ok: false,
      error: '表の内容に問題があります',
      issues: result.error.issues.slice(0, 50).map((i) => ({
        path: describePath(i.path, lines),
        message: i.message,
      })),
    };
  }
  const warnings = skipped > 0 ? [`空欄のある ${skipped} 行は飛ばしました`] : [];
  return { ok: true, pack: result.data as StudyPack, warnings };
}

/** 検証エラーの場所を「3 行目」のように表の行で示す */
function describePath(path: PropertyKey[], lines: number[]): string {
  if (path[0] === 'items' && typeof path[1] === 'number') {
    return `${lines[path[1]]} 行目（${path.slice(2).map(String).join('.')}）`;
  }
  return path.map(String).join('.');
}
