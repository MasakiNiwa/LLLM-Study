/**
 * 回答本文に埋め込まれた思考（<think>…</think>）を本文から分離する。
 * Qwen3 などは思考をチャネルではなく本文の先頭にタグ付きで出力するため。
 */
const OPEN = '<think>';
const CLOSE = '</think>';

export interface ThinkingSplit {
  /** 表示・履歴に使う回答本文 */
  answer: string;
  /** 思考の内容（無ければ undefined） */
  thought?: string;
  /** 思考の途中（</think> がまだ来ていない） */
  thinking: boolean;
}

export function splitThinking(raw: string): ThinkingSplit {
  const head = raw.trimStart();
  // ストリーミング途中で「<thi」のようにタグが途切れている間は何も表示しない
  if (head.length > 0 && head.length < OPEN.length && OPEN.startsWith(head)) {
    return { answer: '', thinking: true };
  }
  if (!head.startsWith(OPEN)) return { answer: raw, thinking: false };

  const rest = head.slice(OPEN.length);
  const end = rest.indexOf(CLOSE);
  if (end === -1) {
    return { answer: '', thought: rest.trim() || undefined, thinking: true };
  }
  return {
    answer: rest.slice(end + CLOSE.length).trimStart(),
    thought: rest.slice(0, end).trim() || undefined,
    thinking: false,
  };
}
