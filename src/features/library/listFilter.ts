/** 教材の一覧の絞り込み（マイ教材・サンプルで共通） */

/** 分野ごとの件数（多い順） */
export function countSubjects<T>(list: T[], key: (t: T) => string): [string, number][] {
  const counts = new Map<string, number>();
  for (const t of list) counts.set(key(t), (counts.get(key(t)) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

/** タイトル・説明・難易度・タグに検索語が含まれるか */
export function matchesQuery(q: string, fields: (string | undefined | null | string[])[]): boolean {
  const query = q.trim().toLowerCase();
  if (!query) return true;
  return fields.flat().filter(Boolean).join(' ').toLowerCase().includes(query);
}
