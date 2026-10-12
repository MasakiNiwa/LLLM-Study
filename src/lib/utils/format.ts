/** バイト数を人が読みやすい単位に変換する */
export function formatBytes(bytes: number | undefined, digits = 1): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(digits)} ${units[i]}`;
}

/** 0〜1 の値をパーセント表記にする */
export function formatPercent(ratio: number): string {
  return `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`;
}

/** ミリ秒を「1.2 秒」などに変換する */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} 秒`;
}

/** 時計の形の時間（例: 0:08、12:34、1:02:03） */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'string') return e;
  try {
    return JSON.stringify(e);
  } catch {
    return String(e);
  }
}
