/**
 * 項目の種類ごとのテキスト表現（一覧の見出し・検索・読み上げ・LLM に渡す形）。
 * React の表示は features/items/ に置き、ここは UI に依存しない処理だけにする。
 */
import type { JournalItem, JournalLine, OrderItem, StudyItem } from './schema';

/** 穴埋めの {{ }} を取り除いた完全な文 */
export function clozeFull(text: string): string {
  return text.replace(/\{\{([^{}]+)\}\}/g, '$1');
}

/** 穴埋めの答え（{{ }} の中身） */
export function clozeAnswers(text: string): string[] {
  return [...text.matchAll(/\{\{([^{}]+)\}\}/g)].map((m) => m[1]);
}

/** 並べ替えの語句（正しい順）。chunks が無ければ answer を空白で区切る */
export function orderChunks(item: Pick<OrderItem, 'answer' | 'chunks'>): string[] {
  return item.chunks ?? item.answer.trim().split(/\s+/);
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
    case 'journal':
    case 'multi':
    case 'numeric':
    case 'table':
      return item.question;
    case 'cloze':
      return clozeFull(item.text);
    case 'order':
      return item.prompt ?? item.answer;
    case 'truefalse':
      return item.statement;
    case 'match':
      return item.prompt ?? item.pairs.map((p) => p.left).join('・');
  }
}

/** 仕訳を 1 行の文字にする（例: 仕入 100,000 / 買掛金 100,000） */
export function journalText(item: Pick<JournalItem, 'debit' | 'credit'>): string {
  const side = (lines: JournalLine[]) =>
    lines.map((l) => `${l.account} ${l.amount.toLocaleString('ja-JP')}`).join('、');
  return `${side(item.debit)} / ${side(item.credit)}`;
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
    case 'order':
      return item.answer;
    case 'journal':
      return journalText(item);
    case 'multi':
      return item.answers.map((i) => item.choices[i]).join('、');
    case 'numeric':
      return `${item.answer.toLocaleString('ja-JP')}${item.unit ?? ''}`;
    case 'truefalse':
      return item.answer ? '○（正しい）' : '×（誤り）';
    case 'match':
      return item.pairs.map((p) => `${p.left} → ${p.right}`).join('、');
    case 'table':
      return item.rows
        .flat()
        .flatMap((c) => clozeAnswers(c))
        .join(' / ');
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
  // 画像（data URL）は検索の対象にしない
  const { image: _image, ...rest } = item;
  walk(rest);
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
    case 'order':
      return item.answer;
    default:
      return undefined;
  }
}

/**
 * 自動で読み上げるタイミング。
 * - front: 問題を表示したとき（意味を答えるカード・聞き取り）
 * - back: 答えを見たあと（読むと答えが分かってしまうもの: 単語を答えるカード・穴埋め・並べ替え）
 */
export function speakTiming(item: StudyItem, template: string): 'front' | 'back' {
  if (item.type === 'cloze' || item.type === 'order') return 'back';
  return template === 'recall' ? 'back' : 'front';
}

/** LLM に渡す項目の内容（ID や空の値を除いたコンパクトな形） */
export function itemForLlm(item: StudyItem): Record<string, unknown> {
  // passage は本文の ID なので渡さない（本文そのものは呼び出し側で添える）
  const { id: _id, passage: _p, image, ...rest } = item;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) {
    if (v === undefined || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  // 画像そのものは渡さない（モデルは画像を読めないため、あることだけ伝える）
  if (image) out.has_image = true;
  if (item.type === 'choice') out.correct_choice = item.choices[item.answer];
  if (item.type === 'order') out.chunks = orderChunks(item);
  if (item.type === 'multi') out.correct_choices = item.answers.map((i) => item.choices[i]);
  return out;
}

/** 入力して答え合わせするときの正解。入力に向かないカード（選択問題）は undefined */
export function expectedAnswer(
  item: StudyItem,
  template: string,
): { accepted: string[] } | { blanks: string[] } | undefined {
  switch (item.type) {
    // 聞き取り（listen）は、表の指示どおり「聞こえた語句の意味」を答える
    case 'vocab':
      return template === 'recall'
        ? { accepted: [item.term] }
        : { accepted: meaningCandidates(item.meanings) };
    case 'phrase':
      return template === 'recall'
        ? { accepted: [item.phrase] }
        : { accepted: meaningCandidates([item.meaning]) };
    case 'qa':
      return { accepted: [item.answer, ...(item.accepted ?? [])] };
    case 'cloze':
      return { blanks: clozeAnswers(item.text) };
    // カードの中で答えてアプリが判定する種類は、入力欄を使わない
    case 'choice':
    case 'order':
    case 'journal':
    case 'multi':
    case 'numeric':
    case 'truefalse':
    case 'match':
    case 'table':
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

/** 決まった種から作る疑似乱数（同じカードなら同じ並びになる） */
function seeded(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/** 語句をシャッフルする（正しい順のままにはしない） */
export function shuffleChunks(chunks: string[], seed: string): number[] {
  const idx = chunks.map((_, i) => i);
  const rand = seeded(seed);
  for (let attempt = 0; attempt < 5; attempt++) {
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    if (idx.some((v, i) => chunks[v] !== chunks[i])) return idx;
  }
  return idx.slice(1).concat(idx[0]);
}
