/**
 * 項目の種類ごとのテキスト表現（一覧の見出し・検索・読み上げ・LLM に渡す形）。
 * React の表示は features/items/ に置き、ここは UI に依存しない処理だけにする。
 */
import type { StudyItem } from './schema';

/** 穴埋めの {{ }} を取り除いた完全な文 */
export function clozeFull(text: string): string {
  return text.replace(/\{\{([^{}]+)\}\}/g, '$1');
}

/** 穴埋めの答え（{{ }} の中身） */
export function clozeAnswers(text: string): string[] {
  return [...text.matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => m[1]);
}

/** 一覧やカレンダーに出す見出し */
export function itemTitle(item: StudyItem): string {
  switch (item.type) {
    case 'vocab':
      return item.term;
    case 'phrase':
      return item.phrase;
    case 'qa':
    case 'choice':
      return item.question;
    case 'cloze':
      return clozeFull(item.text);
  }
}

/** 答え（短い表現） */
export function itemAnswer(item: StudyItem): string {
  switch (item.type) {
    case 'vocab':
      return item.meanings.join('、');
    case 'phrase':
      return item.meaning;
    case 'qa':
      return item.answer;
    case 'cloze':
      return clozeAnswers(item.text).join(' / ');
    case 'choice':
      return item.choices[item.answer] ?? '';
  }
}

/** 検索用に項目の文字列をすべてつなげる（小文字化） */
export function itemSearchText(item: StudyItem): string {
  const parts: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') parts.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(item);
  return parts.join(' ').toLowerCase();
}

/** 読み上げる文（学ぶ言語の部分）。読み上げに向かない種類は undefined */
export function speakText(item: StudyItem): string | undefined {
  switch (item.type) {
    case 'vocab':
      return item.term;
    case 'phrase':
      return item.phrase;
    case 'cloze':
      return clozeFull(item.text);
    default:
      return undefined;
  }
}

/** LLM に渡す項目の内容（ID や空の値を除いたコンパクトな形） */
export function itemForLlm(item: StudyItem): Record<string, unknown> {
  const { id: _id, ...rest } = item;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  if (item.type === 'choice') out.correct_choice = item.choices[item.answer];
  return out;
}

/** 入力して答え合わせするときの正解。入力に向かないカード（選択問題）は undefined */
export function expectedAnswer(
  item: StudyItem,
  template: string,
): { accepted: string[] } | { blanks: string[] } | undefined {
  switch (item.type) {
    case 'vocab':
      return template === 'recall'
        ? { accepted: [item.term] }
        : { accepted: meaningCandidates(item.meanings) };
    case 'phrase':
      return template === 'recall'
        ? { accepted: [item.phrase] }
        : { accepted: meaningCandidates([item.meaning]) };
    case 'qa':
      return { accepted: [item.answer] };
    case 'cloze':
      return { blanks: clozeAnswers(item.text) };
    case 'choice':
      return undefined;
  }
}

/** 意味の候補（「（時間が）かかる」→「かかる」、「取る・持つ」→「取る」「持つ」なども正解にする） */
function meaningCandidates(meanings: string[]): string[] {
  const out = new Set<string>();
  for (const m of meanings) {
    out.add(m);
    const bare = m.replace(/[（(][^）)]*[）)]/g, '').trim();
    for (const part of [bare, ...bare.split(/[・、,／/]/)]) {
      if (part.trim()) out.add(part.trim());
    }
  }
  return [...out];
}

/** 入力が「学ぶ言語の語句」を答えるものか（入力欄の言語ヒント用） */
export function answersInTargetLanguage(item: StudyItem, template: string): boolean {
  return template === 'recall' || item.type === 'cloze';
}
