/**
 * 会話練習の場面と、AI に渡すプロンプト・添削結果の検証。
 * 会話は AI が役を演じ、添削は JSON で受け取ってアプリが検証する。
 */
import { z } from 'zod';
import { extractJson } from '@/lib/packs/parse';
import { languageName } from '@/lib/speech/lang';

/** 練習の種類。language: 語学の会話、business: ビジネスの場面、study: 理解を深める（どの分野でも） */
export type PracticeTrack = 'language' | 'business' | 'study';

export const TRACKS: Record<PracticeTrack, { label: string; emoji: string; description: string }> =
  {
    language: {
      label: '語学の会話',
      emoji: '🌏',
      description: '学んでいる言語で、旅行や日常の場面を会話します。終わったら添削してもらえます',
    },
    business: {
      label: 'ビジネス',
      emoji: '💼',
      description:
        '面接・報告・商談・クレーム対応などを練習します。終わったら、より伝わる言い方を教えてもらえます',
    },
    study: {
      label: '理解を深める',
      emoji: '🎓',
      description:
        '学んでいる内容について、AI の質問に答えたり（口頭試問）、AI に教えたりして理解を確かめます。どの分野でも使えます',
    },
  };

export interface Scenario {
  id: string;
  track: PracticeTrack;
  title: string;
  emoji: string;
  situation: string;
  aiRole: string;
  userRole: string;
  /** AI への追加の指示（役の演じ方） */
  direction?: string;
}

export const SCENARIOS: Scenario[] = [
  // ---- 語学の会話 ----
  {
    id: 'cafe',
    track: 'language',
    title: 'カフェで注文',
    emoji: '☕',
    situation: 'カフェのカウンター',
    aiRole: 'カフェの店員',
    userRole: 'お客さん',
  },
  {
    id: 'hotel',
    track: 'language',
    title: 'ホテルのチェックイン',
    emoji: '🏨',
    situation: 'ホテルのフロント',
    aiRole: 'フロント係',
    userRole: '宿泊客',
  },
  {
    id: 'directions',
    track: 'language',
    title: '道を尋ねる',
    emoji: '🗺️',
    situation: '旅行先の街角',
    aiRole: '通りがかりの地元の人',
    userRole: '道に迷った旅行者',
  },
  {
    id: 'intro',
    track: 'language',
    title: '自己紹介・雑談',
    emoji: '👋',
    situation: '交流イベント',
    aiRole: '初めて会った人',
    userRole: '参加者',
  },
  {
    id: 'shopping',
    track: 'language',
    title: '服を買う',
    emoji: '👕',
    situation: '洋服店',
    aiRole: '店員',
    userRole: 'お客さん',
  },
  {
    id: 'meeting',
    track: 'language',
    title: '仕事の打ち合わせ',
    emoji: '💼',
    situation: 'オンライン会議',
    aiRole: '取引先の担当者',
    userRole: '会社員',
  },
  // ---- ビジネス ----
  {
    id: 'interview',
    track: 'business',
    title: '採用面接',
    emoji: '🤝',
    situation: '中途採用の面接',
    aiRole: '面接官',
    userRole: '応募者',
    direction:
      '志望動機・これまでの経験・強みと弱み・逆質問などを 1 つずつ聞く。答えが抽象的なら具体例を求める',
  },
  {
    id: 'report',
    track: 'business',
    title: '上司への報告・相談',
    emoji: '📋',
    situation: '社内。担当している仕事でトラブル（納期の遅れ）が起きた',
    aiRole: '上司',
    userRole: '部下（担当者）',
    direction:
      '状況・原因・影響・対応策・相談したいことを確認する質問をする。結論が後回しなら「結論から」と促す',
  },
  {
    id: 'sales',
    track: 'business',
    title: '商談・提案',
    emoji: '📈',
    situation: '取引先での商談。ユーザーが自社のサービスを提案する',
    aiRole: '導入を検討している取引先の担当者',
    userRole: '営業担当',
    direction:
      '費用・効果・導入の手間・他社との違いなど、検討する人が気にすることを質問する。すぐには決めない',
  },
  {
    id: 'complaint',
    track: 'business',
    title: 'クレーム対応',
    emoji: '📞',
    situation: 'お客さま窓口（電話）。届いた商品に不具合があった',
    aiRole: '不満を持っているお客さま',
    userRole: '窓口の担当者',
    direction:
      '最初は不満を伝える。担当者がお詫び・事実の確認・対応の提案を適切にすれば、少しずつ落ち着く',
  },
  {
    id: 'negotiation',
    track: 'business',
    title: '納期・価格の交渉',
    emoji: '⚖️',
    situation: '取引先との打ち合わせ',
    aiRole: '取引先の担当者（短い納期と値下げを求めている）',
    userRole: '自社の担当者',
    direction: '自分の希望を伝えつつ、相手の提案や代わりの案には妥協点を探る',
  },
  {
    id: 'one-on-one',
    track: 'business',
    title: '部下との 1on1',
    emoji: '🗣️',
    situation: '定期的な 1 対 1 の面談',
    aiRole: '最近元気がない部下',
    userRole: '上司・リーダー',
    direction:
      '最初は本音を話さない。話を聞いてもらえていると感じたら、悩み（仕事量の多さ）を打ち明ける',
  },
  // ---- 理解を深める ----
  {
    id: 'oral-exam',
    track: 'study',
    title: '口頭試問',
    emoji: '🧑‍🏫',
    situation: '口頭試問（先生が質問し、学習者が答える）',
    aiRole: '先生（試験官）',
    userRole: '学習者',
    direction:
      '1 回に 1 問だけ質問する。答えを聞いたら、合っている点と足りない点・誤りを短く伝えてから、次の質問をする。だんだん「なぜ」「たとえば」と理解を問う質問にする',
  },
  {
    id: 'teach-ai',
    track: 'study',
    title: 'AI に教える',
    emoji: '🐣',
    situation: '学習者が先生役になって、初めて学ぶ生徒に説明する',
    aiRole: 'この話題を初めて学ぶ、好奇心の強い生徒',
    userRole: '先生役',
    direction:
      '説明を聞いて、わからない点を素直に質問する。ときどき「つまり〜ということ？」と自分の言葉で言い直し、説明があいまいな点を確かめる',
  },
];

export type PracticeLevel = 'easy' | 'normal' | 'hard';

export const LEVEL_LABELS: Record<PracticeLevel, string> = {
  easy: 'やさしい',
  normal: 'ふつう',
  hard: 'むずかしい',
};

const LEVEL_PROMPTS: Record<PracticeTrack, Record<PracticeLevel, string>> = {
  language: {
    easy: '初級者向け。簡単な単語と短い文だけを使い、ゆっくり進める',
    normal: '中級者向け。日常でよく使う自然な表現を使う',
    hard: '上級者向け。ネイティブが使う自然な表現や言い回しも使う',
  },
  business: {
    easy: '相手は協力的で、話を丁寧に聞いてくれる',
    normal: '相手はふつうのビジネスパーソン。あいまいな点は質問する',
    hard: '相手は手ごわい。厳しい質問や反論をし、簡単には納得しない',
  },
  study: {
    easy: '基本的な内容（用語の意味・基本の事実）を中心にする',
    normal: '基本に加えて、理由や関係を問う内容も入れる',
    hard: '応用・例外・ほかの知識とのつながりまで深掘りする',
  },
};

export const LEVEL_TITLES: Record<PracticeTrack, Record<PracticeLevel, string>> = {
  language: LEVEL_LABELS,
  business: { easy: '話しやすい相手', normal: 'ふつう', hard: '手ごわい相手' },
  study: { easy: '基本', normal: 'ふつう', hard: '応用・深掘り' },
};

/** 語学の会話で選べる言語 */
export const PRACTICE_LANGUAGES = ['en', 'zh', 'ko', 'fr', 'es', 'de', 'it'] as const;
/** ビジネス・理解を深める練習で選べる言語（日本語が既定） */
export const GENERAL_LANGUAGES = ['ja', ...PRACTICE_LANGUAGES] as const;

export interface PracticeConfig {
  scenario: Scenario;
  lang: string;
  level: PracticeLevel;
  /** 会話に取り入れてほしい学習中の語句（プログラムが選ぶ。語学の会話だけ） */
  vocab: string[];
  /** 理解を深める練習の話題 */
  topic?: string;
  /** 理解を深める練習の材料（教材から選んだ項目の要点。プログラムが選ぶ） */
  material?: string[];
}

/** 訳を書く行の目印 */
export const TRANSLATION_MARK = '訳:';

function isJapanese(lang: string): boolean {
  return lang.toLowerCase().startsWith('ja');
}

export function rolePlayPrompt(c: PracticeConfig): string {
  const lang = languageName(c.lang);
  const { track } = c.scenario;
  const intro: Record<PracticeTrack, string> = {
    language: 'あなたは語学の会話練習の相手です。次の場面で、役になりきって会話してください。',
    business:
      'あなたはビジネスコミュニケーションの練習相手です。次の場面で、役になりきって会話してください。',
    study: 'あなたは学習を手伝う練習相手です。次の役になりきって、学習者と対話してください。',
  };
  const lines = [
    intro[track],
    `- 場面: ${c.scenario.situation}`,
    `- あなたの役: ${c.scenario.aiRole}`,
    `- 相手（ユーザー）の役: ${c.scenario.userRole}`,
  ];
  if (c.topic) lines.push(`- 話題: ${c.topic}`);
  lines.push(
    '【ルール】',
    track === 'language'
      ? `- 会話は${lang}だけで話す。1 回の発言は 1〜2 文と短くし、相手が答えやすいように問いかけで終えることが多い`
      : `- ${lang}で話す。1 回の発言は 1〜3 文と短くし、相手が答えやすいように問いかけで終えることが多い`,
    `- レベル: ${LEVEL_PROMPTS[track][c.level]}`,
  );
  if (c.scenario.direction) lines.push(`- 役の演じ方: ${c.scenario.direction}`);
  if (track === 'language') {
    lines.push(
      '- 相手の間違いは会話の中では指摘せず、自然に会話を続ける（添削はあとでまとめて行う）',
    );
  } else if (track === 'business') {
    lines.push(
      '- 相手の話し方を会話の中で講評しない（ふりかえりはあとでまとめて行う）',
      '- 実在の会社名・人名は使わない。数字などの設定が必要なら、もっともらしいものを自分で決めてよい',
    );
  } else {
    lines.push(
      '- 事実として不確かなことは断定しない。材料がある場合は、材料の内容を正しいものとして扱う',
    );
  }
  if (!isJapanese(c.lang)) {
    lines.push(`- 毎回、発言のあとに改行し「${TRANSLATION_MARK} 」に続けて日本語訳を書く`);
  }
  lines.push('- 役から外れた説明や、ルールについての発言はしない');
  if (c.vocab.length > 0) {
    lines.push(`- 次の語句を、自然に使える場面があれば会話に取り入れる: ${c.vocab.join(', ')}`);
  }
  if (c.material && c.material.length > 0) {
    lines.push(
      '【材料（学習者が学んでいる内容。ここから話題を選ぶ）】',
      ...c.material.map((m) => `- ${m}`),
    );
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

/** 会話のふりかえりの名前（語学は添削、ビジネスはふりかえり、理解を深めるは理解のチェック） */
export const FEEDBACK_LABELS: Record<PracticeTrack, { action: string; title: string }> = {
  language: { action: '添削してもらう', title: '添削' },
  business: { action: 'ふりかえる', title: 'ふりかえり' },
  study: { action: '理解をチェック', title: '理解のチェック' },
};

export interface TranscriptLine {
  role: 'user' | 'assistant';
  text: string;
}

export function feedbackPrompt(
  c: Pick<PracticeConfig, 'scenario' | 'lang' | 'topic'>,
  utterances: string[],
  transcript: TranscriptLine[] = [],
): string {
  const lang = languageName(c.lang);
  const meaning = isJapanese(c.lang) ? '' : ', "meaning": "直した文の日本語訳"';
  switch (c.scenario.track) {
    case 'business':
      return [
        `次は、ビジネスの会話練習（場面: ${c.scenario.title}、ユーザーの役: ${c.scenario.userRole}）でユーザーが${lang}で話した発言です。`,
        'より伝わりやすく、場面にふさわしい言い方に直してください（敬語・結論から話す・相手への配慮・具体性など）。',
        '<utterances>',
        JSON.stringify(utterances),
        '</utterances>',
        'すでに十分よい発言は corrections に含めないでください。',
        '次の形の JSON だけを出力してください（説明文は不要）:',
        `{"corrections": [{"original": "ユーザーの発言", "corrected": "よりよい言い方（${lang}）"${meaning}, "note": "よくなる理由（日本語で短く）"}], "good": "よかった点をひとこと（日本語）"}`,
      ].join('\n');
    case 'study':
      return [
        `次は、「${c.topic || c.scenario.title}」について学習者と対話した記録です（学習者の役: ${c.scenario.userRole}）。`,
        '学習者の発言のうち、事実の誤り・不正確な説明・大事な点の抜けを直してください。確かでないことは直さないでください。',
        '<transcript>',
        JSON.stringify(transcript),
        '</transcript>',
        '正しい発言は corrections に含めないでください。',
        '次の形の JSON だけを出力してください（説明文は不要）:',
        '{"corrections": [{"original": "学習者の発言（誤りを含む部分）", "corrected": "正しい説明", "note": "どこが違ったか（短く）"}], "good": "よく理解できている点をひとこと"}',
      ].join('\n');
    default:
      return [
        `次は、語学の会話練習で学習者が${lang}で書いた発言です。誤りや不自然な表現を直してください。`,
        '<utterances>',
        JSON.stringify(utterances),
        '</utterances>',
        '誤りや不自然な点がない発言は corrections に含めないでください。',
        '次の形の JSON だけを出力してください（説明文は不要）:',
        `{"corrections": [{"original": "学習者の発言", "corrected": "直した${lang}の文", "meaning": "直した文の日本語訳", "note": "直した理由（日本語で短く）"}], "good": "よかった点をひとこと（日本語）"}`,
      ].join('\n');
  }
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
