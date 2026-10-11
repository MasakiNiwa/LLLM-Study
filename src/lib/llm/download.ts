/**
 * URL（Hugging Face など）から .litertlm をダウンロードするためのユーティリティ。
 */

/** Hugging Face の「blob」URL を直接ダウンロードできる「resolve」URL に直す */
export function normalizeModelUrl(input: string): string {
  const url = new URL(input.trim());
  if (url.hostname === 'huggingface.co' || url.hostname.endsWith('.huggingface.co')) {
    url.pathname = url.pathname.replace('/blob/', '/resolve/');
  }
  return url.toString();
}

/** URL からファイル名（.litertlm）を取り出す。取り出せなければ null */
export function fileNameFromUrl(input: string): string | null {
  try {
    const url = new URL(input.trim());
    const last = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() ?? '');
    return last.toLowerCase().endsWith('.litertlm') ? last : null;
  } catch {
    return null;
  }
}
