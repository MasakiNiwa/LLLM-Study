import type { RevealOutcome } from './personas';

/**
 * 学習画面の「AI に聞く」ボタンのプロンプト。
 * カードの内容と学習状況（構造化データ）を渡し、目的に合わせた短い応答を作ってもらう。
 * 語学の教材と、それ以外の分野（知識・考え方を理解する教材）でボタンと指示を変える。
 */
export type AssistAction = 'explain' | 'examples' | 'mnemonic' | 'together';

/** language: 語学（単語・表現を覚える）、general: それ以外の分野 */
export type AssistDomain = 'language' | 'general';

export interface AssistDef {
  id: AssistAction;
  label: string;
  hint: string;
  instruction: string;
}

const TOGETHER: AssistDef = {
  id: 'together',
  label: '一緒に悩んで',
  hint: '間違えた理由を一緒に考える',
  instruction:
    'ユーザーはこのカードを思い出せませんでした。責めずに共感しつつ、間違えやすい理由や紛らわしいポイントを一緒に考え、次に思い出すための手がかりを 1 つ提案してください。',
};

const ACTIONS: Record<AssistDomain, AssistDef[]> = {
  language: [
    {
      id: 'explain',
      label: '解説して',
      hint: '意味・使い方・ニュアンス',
      instruction:
        'このカードの内容を解説してください。意味・使い方・ニュアンスや似た表現との違いなど、覚えるのに役立つ要点を 3〜5 点に絞ってください。',
    },
    {
      id: 'examples',
      label: '例文を作って',
      hint: '使い方がわかる例文',
      instruction:
        'このカードの内容を使った自然な例文を 3 つ作ってください。日常でよく使う場面を選び、それぞれに和訳を付けてください。',
    },
    {
      id: 'mnemonic',
      label: '覚え方は？',
      hint: '語源や連想で覚える',
      instruction:
        'このカードの内容を覚えるためのコツを教えてください。語源・イメージ・語呂合わせ・関連語など、記憶に残りやすい方法を 2〜3 個、短く紹介してください。',
    },
    TOGETHER,
  ],
  general: [
    {
      id: 'explain',
      label: '解説して',
      hint: '要点・理由・間違えやすい点',
      instruction:
        'このカードの内容を解説してください。要点・そうなる理由や背景・間違えやすい点など、理解に役立つポイントを 3〜5 点に絞ってください。カードの答えと食い違うことは書かないでください。',
    },
    {
      id: 'examples',
      label: '具体例を出して',
      hint: '身近な例・使われる場面',
      instruction:
        'このカードの内容に関係する具体例を 3 つ挙げてください。身近な場面や、実際に使われる・役に立つ場面を選び、それぞれ短く説明してください。',
    },
    {
      id: 'mnemonic',
      label: '覚え方は？',
      hint: 'イメージや関連づけで覚える',
      instruction:
        'このカードの内容を覚えるためのコツを教えてください。イメージ・語呂合わせ・すでに知っていることとの関連づけなど、記憶に残りやすい方法を 2〜3 個、短く紹介してください。',
    },
    TOGETHER,
  ],
};

export function assistActions(domain: AssistDomain): AssistDef[] {
  return ACTIONS[domain];
}

/** ユーザーが答えを書いていたときに添える指示 */
const USER_ANSWER_NOTE =
  'card の user_answer はユーザーが自分で書いた答えです。正解との違い（または合っている点）にも触れてください。app_check はアプリの判定なので、それと食い違う判定はしないでください（「判定なし」のときは意味が合っているかを考えてください）。';

export function assistPrompt(
  action: AssistAction,
  cardJson: Record<string, unknown>,
  domain: AssistDomain = 'language',
): string {
  const instruction = ACTIONS[domain].find((a) => a.id === action)?.instruction ?? '';
  const instructions = 'user_answer' in cardJson ? [instruction, USER_ANSWER_NOTE] : [instruction];
  return [...instructions, '', '<card>', JSON.stringify(cardJson), '</card>'].join('\n');
}

/** 答えを見たときの結果の説明（AI に渡す） */
const OUTCOME_LABELS: Record<RevealOutcome, string> = {
  correct: '正解した（アプリの判定）',
  close: '惜しかった（アプリの判定。つづりの小さな違いなど）',
  wrong: '間違えた（アプリの判定）',
  timeout: '制限時間内に答えられなかった',
  gaveup: '分からなくて答えを見た',
  self: '頭の中で思い出してから答えを見た（正誤は本人がこれから評価する）',
};

/**
 * ひとことの吹き出しの数（プログラムが決める）。たいていは 1 つ、ときどき 2〜3 つ。
 * rand: 0〜1 の乱数
 */
export function pickReactionLineCount(rand: number): number {
  return rand < 0.6 ? 1 : rand < 0.88 ? 2 : 3;
}

/**
 * 答えを見て解説を読んでいるユーザーへの「ひとこと」を AI に考えてもらうプロンプト。
 * 結果（正誤）はアプリが決めて渡し、AI は性格を出した言葉にするだけ。
 */
export function revealReactionPrompt(
  outcome: RevealOutcome,
  lines: number,
  cardJson: Record<string, unknown> | null,
  sessionStats: { done: number; correctStreak: number },
): string {
  return [
    `ユーザーが学習カードの答えを見て、解説を読んでいます。結果: ${OUTCOME_LABELS[outcome]}`,
    `このセッションで ${sessionStats.done + 1} 枚目、ここまでの連続正解 ${sessionStats.correctStreak} 回。`,
    cardJson ? `<card>${JSON.stringify(cardJson)}</card>` : '',
    cardJson && 'user_answer' in cardJson
      ? 'ユーザーは自分で答えを書いていました（card の user_answer）。その答えにも触れてよい（正誤は app_check と結果に合わせる）。'
      : '',
    `あなたの性格をはっきり出して、ユーザーに話しかけてください。ちょうど ${lines} 行で書きます（1 行が 1 つの吹き出し。1 行は 1〜2 文・60 文字くらいまで）。`,
    '- 励まし・ほめ言葉・覚え方のヒント・カードの内容にまつわる豆知識など、行ごとに違うことを言う',
    '- カードの答えと食い違うこと、不確かなことは書かない。結果と矛盾することも言わない',
    '- 番号・箇条書きの記号・かぎかっこ・前置きは付けない。絵文字は 1 行に 1 つまで',
  ]
    .filter(Boolean)
    .join('\n');
}

/** AI の出力を吹き出しの行に分ける（番号や記号を取り、長すぎる行は切る） */
export function parseReactionLines(text: string, max: number): string[] {
  return text
    .split('\n')
    .map((l) =>
      l
        .replace(/^\s*(?:[-*・•]|\d+[.)、．]|[（(]?\d+[)）])\s*/, '')
        .replace(/^[「『"]|[」』"]$/g, '')
        .trim(),
    )
    .filter(Boolean)
    .slice(0, max)
    .map((l) => (l.length > 120 ? `${l.slice(0, 120)}…` : l));
}
