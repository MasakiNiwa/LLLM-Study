/**
 * 教材・カードの変更の知らせ（同じタブの中）。
 * 教材の削除・更新・進捗のリセットなどのあと、学習中のセッションが古いカードを
 * 持ち続けないように、学習の状態（studyStore）がこれを聞いて作り直す。
 */
type Listener = (packIds: string[] | null) => void;

const listeners = new Set<Listener>();

export function onLibraryChange(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** packIds: 変わった教材（null はすべて。バックアップの復元など） */
export function notifyLibraryChange(packIds: string[] | null): void {
  for (const fn of listeners) fn(packIds);
}
