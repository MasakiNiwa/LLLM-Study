/** 教材の分野（pack.subject）の表示名。知らない値はそのまま表示する */
const SUBJECT_LABELS: Record<string, string> = {
  english: '英語',
  japanese: '国語・日本語',
  chinese: '中国語',
  korean: '韓国語',
  spanish: 'スペイン語',
  french: 'フランス語',
  german: 'ドイツ語',
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
  civics: '公民',
  business: 'ビジネス',
  money: 'お金',
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

/** サンプル教材の一覧で使う、分野の大きなまとまり（この順に並べる） */
const SUBJECT_GROUPS: { key: string; label: string; subjects: string[] }[] = [
  { key: 'english', label: '英語', subjects: ['english'] },
  {
    key: 'languages',
    label: '外国語・国語',
    subjects: ['chinese', 'korean', 'spanish', 'french', 'german', 'language', 'japanese'],
  },
  {
    key: 'math-science',
    label: '数学・理科',
    subjects: ['math', 'mathematics', 'science', 'chemistry', 'physics', 'biology'],
  },
  { key: 'social', label: '社会', subjects: ['history', 'geography', 'civics', 'law'] },
  { key: 'it', label: 'IT・プログラミング', subjects: ['it', 'programming'] },
  {
    key: 'business',
    label: 'ビジネス・お金',
    subjects: ['business', 'money', 'bookkeeping', 'accounting'],
  },
];

/** 分野のまとまりのキー（どれにも入らなければ NO_SUBJECT） */
export function subjectGroupKey(subject: string | undefined): string {
  const key = subjectKey(subject);
  return SUBJECT_GROUPS.find((g) => g.subjects.includes(key))?.key ?? NO_SUBJECT;
}

export function subjectGroupLabel(key: string): string {
  return SUBJECT_GROUPS.find((g) => g.key === key)?.label ?? 'その他';
}

/** まとまりごとの件数（決まった順。0 件のまとまりは除く） */
export function countSubjectGroups<T>(
  list: T[],
  subject: (t: T) => string | undefined,
): [string, number][] {
  const counts = new Map<string, number>();
  for (const t of list) {
    const k = subjectGroupKey(subject(t));
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...SUBJECT_GROUPS.map((g) => g.key), NO_SUBJECT]
    .filter((k) => counts.has(k))
    .map((k) => [k, counts.get(k) ?? 0]);
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
