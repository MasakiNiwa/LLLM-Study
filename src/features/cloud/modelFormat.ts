import type { CloudModel } from '@/lib/cloud/providers';

/** モデルの情報の表示（入力の長さ・料金） */
export function formatTokens(n?: number): string | null {
  if (!n) return null;
  return n >= 1_000_000 ? `${+(n / 1_000_000).toFixed(1)}M` : `${Math.round(n / 1000)}K`;
}

export function formatPrice(m: CloudModel): string | null {
  if (m.free) return '無料';
  if (m.promptPrice == null || m.completionPrice == null) return null;
  const f = (n: number) => (n === 0 ? '0' : n < 1 ? `${+n.toFixed(3)}` : `${+n.toFixed(2)}`);
  return `$${f(m.promptPrice)} / $${f(m.completionPrice)}${m.priceIsReference ? '（参考）' : ''}`;
}
