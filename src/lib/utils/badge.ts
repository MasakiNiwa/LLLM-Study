/**
 * アプリのアイコンに数字を出す（Badging API）。
 * ホーム画面に追加した PWA で使える（Chrome / Edge / iOS 16.4 以降の Safari など）。
 * 使えない環境では何もしない。
 */
export function setAppBadge(count: number): void {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    const p = count > 0 ? nav.setAppBadge?.(count) : nav.clearAppBadge?.();
    p?.catch(() => {});
  } catch {
    // 対応していない・許可されていない
  }
}
