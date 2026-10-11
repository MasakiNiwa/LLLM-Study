/**
 * 会話練習の場面と、AI に渡すプロンプト・添削結果の検証。
 * 会話は AI が役を演じ、添削は JSON で受け取ってアプリが検証する。
 */
import { z } from 'zod';
import { extractJson } from '@/lib/packs/parse';
import { languageName } from '@/lib/speech/lang';

export interface Scenario {
  id: string;
  title: string;
  emoji: string;
  situation: string;
  aiRole: string;
  userRole: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'cafe',
    title: 'カフェで注文',
    emoji: '☕',
    situation: 'カフェのカウンター',
    aiRole: 'カフェの店員',
    userRole: 'お客さん',
  },
  {
    id: 'hotel',
    title: 'ホテルのチェックイン',
    emoji: '🏨',
    situation: 'ホテルのフロント',
    aiRole: 'フロント係',
    userRole: '宿泊客',
  },
  {
    id: 'directions',
    title: '道を尋ねる',
    emoji: '🗺️',
    situation: '旅行先の街角',
    aiRole: '通りがかりの地元の人',
    userRole: '道に迷った旅行者',
  },
  {
    id: 'intro',
    title: '自己紹介・雑談',
    emoji: '👋',
    situation: '交流イベント',
    aiRole: '初めて会った人',
    userRole: '参加者',
  },
  {
    id: 'shopping',
    title: '服を買う',
    emoji: '👕',
    situation: '洋服店',
    aiRole: '店員',
    userRole: 'お客さん',
  },
  {
    id: 'meeting',
    title: '仕事の打ち合わせ',
    emoji: '💼',
    situation: 'オンライン会議',
    aiRole: '取引先の担当者',
    userRole: '会社員',
  },
];

export type PracticeLevel = 'easy' | 'normal' | 'hard';

export const LEVEL_LABELS: Record<PracticeLevel, string> = {
  easy: 'やさしい',
  normal: 'ふつう',
  hard: 'むずかしい',
};

const LEVEL_PROMPTS: Record<PracticeLevel, string> = {
  easy: '初級者向け。簡単な単語と短い文だけを使い、ゆっくり進める',
  normal: '中級者向け。日常でよく使う自然な表現を使う',
  hard: '上級者向け。ネイティブが使う自然な表現や言い回しも使う',
};

export const PRACTICE_LANGUAGES = ['en', 'zh', 'ko', 'fr', 'es', 'de', 'it'] as const;

export interface PracticeConfig {
  scenario: Scenario;
  lang: string;
  level: PracticeLevel;
  /** 会話に取り入れてほしい学習中の語句（プログラムが選ぶ） */
  vocab: string[];
}

/** 訳を書く行の目印 */
export const TRANSLATION_MARK = '訳:';

export function rolePlayPrompt(c: PracticeConfig): string {
  const lang = languageName(c.lang);
  const lines = [
    'あなたは語学の会話練習の相手です。次の場面で、役になりきって会話してください。',
    `- 場面: ${c.scenario.situation}`,
    `- あなたの役: ${c.scenario.aiRole}`,
    `- 相手（ユーザー）の役: ${c.scenario.userRole}`,
    '【ルール】',
    `- 会話は${lang}だけで話す。1 回の発言は 1〜2 文と短くし、相手が答えやすいように問いかけで終えることが多い`,
    `- レベル: ${LEVEL_PROMPTS[c.level]}`,
    '- 相手の間違いは会話の中では指摘せず、自然に会話を続ける（添削はあとでまとめて行う）',
    `- 毎回、発言のあとに改行し「${TRANSLATION_MARK} 」に続けて日本語訳を書く`,
    '- 役から外れた説明や、ルールについての発言はしない',
  ];
  if (c.vocab.length > 0) {
    lines.push(`- 次の語句を、自然に使える場面があれば会話に取り入れる: ${c.vocab.join(', ')}`);
  }
  return lines.join('\n');
}

/** 会話の最初に AI から話しかけてもらうための発話（画面には出さない） */
export const OPENING_MESSAGE =
  '（会話を始めてください。あなたから最初のひとことを話しかけてください）';

/** AI の発言を、本文と訳に分ける */
export function splitTranslation(text: string): { line: string; translation?: string } {
  const i = text.indexOf(TRANSLATION_MARK);
  if (i < 0) return { line: text.trim() };
  return {
    line: text.slice(0, i).trim(),
    translation: text.slice(i + TRANSLATION_MARK.length).trim() || undefined,
  };
}

export const FeedbackSchema = z.object({
  corrections: z
    .array(
      z.object({
        original: z.string().trim().min(1).max(300),
        corrected: z.string().trim().min(1).max(300),
        meaning: z.string().trim().max(300).optional(),
        note: z.string().trim().max(300).optional(),
      }),
    )
    .max(10),
  good: z.string().trim().max(300).optional(),
});

export type Feedback = z.infer<typeof FeedbackSchema>;

export function feedbackPrompt(lang: string, utterances: string[]): string {
  return [
    `次は、語学の会話練習で学習者が${languageName(lang)}で書いた発言です。誤りや不自然な表現を直してください。`,
    '<utterances>',
    JSON.stringify(utterances),
    '</utterances>',
    '誤りや不自然な点がない発言は corrections に含めないでください。',
    '次の形の JSON だけを出力してください（説明文は不要）:',
    `{"corrections": [{"original": "学習者の発言", "corrected": "直した${languageName(lang)}の文", "meaning": "直した文の日本語訳", "note": "直した理由（日本語で短く）"}], "good": "よかった点をひとこと（日本語）"}`,
  ].join('\n');
}

export function parseFeedback(text: string): Feedback | null {
  try {
    const r = FeedbackSchema.safeParse(JSON.parse(extractJson(text)));
    if (!r.success) return null;
    // 同じ文のままの「添削」は除く
    return {
      ...r.data,
      corrections: r.data.corrections.filter((c) => c.original.trim() !== c.corrected.trim()),
    };
  } catch {
    return null;
  }
}
