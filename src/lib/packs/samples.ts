/**
 * リポジトリに同梱しているサンプル教材（public/packs/）。
 * 一覧（index.json）は scripts/build-packs.ts が生成する。
 */
import type { ItemType } from './schema';

export interface SampleEntry {
  file: string;
  id: string;
  title: string;
  description?: string;
  level?: string;
  tags?: string[];
  revision: number;
  itemCount: number;
  itemTypes: ItemType[];
}

let cache: Promise<SampleEntry[]> | null = null;

export function fetchSampleIndex(): Promise<SampleEntry[]> {
  cache ??= fetch('./packs/index.json')
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<{ packs: SampleEntry[] }>;
    })
    .then((d) => d.packs)
    .catch((e) => {
      cache = null;
      throw e;
    });
  return cache;
}

export async function fetchSampleText(file: string): Promise<string> {
  const r = await fetch(`./packs/${encodeURIComponent(file)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}
