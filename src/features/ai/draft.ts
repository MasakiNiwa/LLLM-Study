/**
 * マイカードの下書きを AI に作ってもらう。
 * AI には教材パック形式の項目（JSON）で答えてもらい、アプリが zod で検証してからフォームに入れる。
 * 内容はユーザーが確認・修正してから保存する。
 */
import { extractJson } from '@/lib/packs/parse';
import { ItemSchema, type StudyItem } from '@/lib/packs/schema';
import { ITEM_TYPE_GUIDES, examplePack } from '@/lib/packs/spec';
import type { UserItemDraft } from '@/lib/packs/userPack';

export type DraftType = 'vocab' | 'phrase' | 'qa';

export function draftPrompt(type: DraftType, seed: string): string {
  const example = examplePack([type]).items[0];
  return [
    `学習カードを 1 枚作ってください。種類: ${type}（${ITEM_TYPE_GUIDES[type]}）`,
    `元にする言葉: ${seed}`,
    '説明・意味・訳は日本語、見出し語・例文は学ぶ言語（英語など）で書いてください。',
    '事実と異なる内容は入れず、自信がない項目は省略してください。',
    '次の例と同じ形の JSON だけを出力してください（説明文は不要）:',
    JSON.stringify(example),
  ].join('\n');
}

/** AI の出力から項目を取り出す（ID は付け直す）。形が合わなければ null */
export function parseDraft(text: string, type: DraftType): UserItemDraft | null {
  try {
    const raw = JSON.parse(extractJson(text)) as Record<string, unknown>;
    const r = ItemSchema.safeParse({ ...raw, id: 'draft', type });
    if (!r.success) return null;
    const { id: _id, ...draft } = r.data as StudyItem;
    return draft as UserItemDraft;
  } catch {
    return null;
  }
}
