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
