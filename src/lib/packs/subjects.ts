/** 教材の分野（pack.subject）の表示名。知らない値はそのまま表示する */
const SUBJECT_LABELS: Record<string, string> = {
  english: '英語',
  japanese: '日本語',
  language: '語学',
  bookkeeping: '簿記',
  accounting: '会計',
  history: '歴史',
  geography: '地理',
  math: '数学',
  mathematics: '数学',
  science: '理科',
  programming: 'プログラミング',
  it: 'IT',
  law: '法律',
  business: 'ビジネス',
  chemistry: '化学',
  physics: '物理',
  biology: '生物',
  general: '一般',
};

export const NO_SUBJECT = '__none__';

export function subjectKey(subject: string | undefined): string {
  return subject?.trim().toLowerCase() || NO_SUBJECT;
}

export function subjectLabel(key: string): string {
  if (key === NO_SUBJECT) return 'その他';
  return SUBJECT_LABELS[key] ?? key;
}

/** 語学として扱う分野 */
const LANGUAGE_SUBJECTS = new Set([
  'english',
  'japanese',
  'language',
  'chinese',
  'korean',
  'french',
  'spanish',
  'german',
]);

/**
 * 語学の教材か（AI の解説・会話練習などの出し分けに使う）。
 * 学ぶ言語と説明の言語が違えば語学。どちらも同じ（例: 日本語で学ぶ簿記）なら、分野で決める。
 */
export function isLanguagePack(pack: {
  subject?: string;
  language?: { target: string; explanation: string };
}): boolean {
  const base = (l: string) => l.toLowerCase().split('-')[0];
  if (pack.language && base(pack.language.target) !== base(pack.language.explanation)) return true;
  return LANGUAGE_SUBJECTS.has(subjectKey(pack.subject));
}
