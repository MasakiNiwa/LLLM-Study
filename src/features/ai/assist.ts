/**
 * 学習画面の「AI に聞く」ボタンのプロンプト。
 * カードの内容と学習状況（構造化データ）を渡し、目的に合わせた短い応答を作ってもらう。
 */
export type AssistAction = 'explain' | 'examples' | 'mnemonic' | 'together';

export const ASSIST_ACTIONS: { id: AssistAction; label: string; hint: string }[] = [
  { id: 'explain', label: '解説して', hint: '意味・使い方・ニュアンス' },
  { id: 'examples', label: '例文を作って', hint: '使い方がわかる例文' },
  { id: 'mnemonic', label: '覚え方は？', hint: '語源や連想で覚える' },
  { id: 'together', label: '一緒に悩んで', hint: '間違えた理由を一緒に考える' },
];

const INSTRUCTIONS: Record<AssistAction, string> = {
  explain:
    'このカードの内容を解説してください。意味・使い方・ニュアンスや似た表現との違いなど、覚えるのに役立つ要点を 3〜5 点に絞ってください。',
  examples:
    'このカードの内容を使った自然な例文を 3 つ作ってください。日常でよく使う場面を選び、それぞれに和訳を付けてください。',
  mnemonic:
    'このカードの内容を覚えるためのコツを教えてください。語源・イメージ・語呂合わせ・関連語など、記憶に残りやすい方法を 2〜3 個、短く紹介してください。',
  together:
    'ユーザーはこのカードを思い出せませんでした。責めずに共感しつつ、間違えやすい理由や紛らわしいポイントを一緒に考え、次に思い出すための手がかりを 1 つ提案してください。',
};

export function assistPrompt(action: AssistAction, cardJson: Record<string, unknown>): string {
  return [INSTRUCTIONS[action], '', '<card>', JSON.stringify(cardJson), '</card>'].join('\n');
}

/** 評価へのひとことを AI に考えてもらうプロンプト */
export function reactionPrompt(
  grade: number,
  cardJson: Record<string, unknown> | null,
  sessionStats: { done: number; correctStreak: number },
): string {
  const label = { 1: 'もう一度（思い出せなかった）', 2: '難しい', 3: '正解', 4: '簡単' }[grade];
  return [
    `ユーザーがカードを評価しました: ${label}`,
    `このセッションで ${sessionStats.done} 枚目、連続正解 ${sessionStats.correctStreak} 回。`,
    cardJson ? `<card>${JSON.stringify(cardJson)}</card>` : '',
    'あなたの性格で、ひとことだけ（30 文字程度・1 文）リアクションしてください。絵文字は 1 つまで。説明はしないでください。',
  ]
    .filter(Boolean)
    .join('\n');
}
