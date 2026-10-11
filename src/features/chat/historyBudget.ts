/**
 * チャットの履歴を、モデルの文脈長（入力できるトークン数）に収まるように古い方から削る。
 * 履歴を全部渡していると、会話が長くなったときに文脈長を超えて生成に失敗するため。
 *
 * - トークン数は文字数からの概算（日本語などは 1 文字 ≒ 1 トークン、英数字は 4 文字 ≒ 1 トークン）
 * - 削る位置は TRIM_STEP 件単位にそろえる。毎回 1 件ずつずれると、エンジン側の会話（KV キャッシュ）を
 *   毎回作り直すことになって遅くなるため、しばらく同じ位置から渡し続けるようにする
 */
import type { ChatTurn } from '@/lib/llm/types';

/** 削るときの単位（ユーザーと AI の 2 往復ぶん） */
export const TRIM_STEP = 4;

/** 文章のおおよそのトークン数 */
export function estimateTokens(text: string): number {
  let wide = 0;
  let narrow = 0;
  for (const ch of text) {
    if (/[\u3000-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(ch)) wide++;
    else narrow++;
  }
  return wide + Math.ceil(narrow / 4);
}

export interface HistoryBudget {
  /** モデルの文脈長（設定の「文脈長」） */
  maxNumTokens: number;
  /** 応答に取っておくトークン数 */
  maxOutputTokens: number;
  /** システムプロンプト・ツールの定義・今回の発言など、履歴以外に使う分 */
  reserved: number;
}

/** 文脈長に収まるよう、古い方から TRIM_STEP 件単位で履歴を削る */
export function trimHistory(history: ChatTurn[], budget: HistoryBudget): ChatTurn[] {
  const available = budget.maxNumTokens - budget.maxOutputTokens - budget.reserved;
  const cost = history.map((t) => estimateTokens(t.text) + 8);
  let total = cost.reduce((a, b) => a + b, 0);
  let start = 0;
  while (total > available && start < history.length) {
    const next = Math.min(start + TRIM_STEP, history.length);
    for (let i = start; i < next; i++) total -= cost[i];
    start = next;
  }
  // 先頭は必ずユーザーの発言から始める（AI の発言から始まると、モデルが混乱することがあるため）
  while (start < history.length && history[start].role !== 'user') start++;
  return history.slice(start);
}
