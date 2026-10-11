/**
 * 教材の取り込み操作（UI から呼ぶ）。解析・検証は Data Worker で行い、画面を止めない。
 */
import { toast } from 'sonner';
import { dataWorker } from '@/lib/data/client';
import { installPack, type InstallSummary } from '@/lib/packs/install';
import type { ParseResult } from '@/lib/packs/parse';
import type { StudyPack } from '@/lib/packs/schema';
import { fetchSampleText, type SampleEntry } from '@/lib/packs/samples';
import { errorMessage } from '@/lib/utils/format';
import { useLibrary } from './libraryStore';

export function parsePackInWorker(text: string): Promise<ParseResult> {
  return dataWorker().parsePack(text);
}

export function describeInstall(s: InstallSummary): string {
  if (s.created) return `${s.added} 項目を追加しました`;
  const parts = [`${s.updated} 項目を更新`];
  if (s.added) parts.push(`${s.added} 項目を追加`);
  if (s.removed) parts.push(`${s.removed} 項目を削除`);
  return `${parts.join('・')}しました（学習記録は引き継ぎます）`;
}

export async function installParsedPack(
  pack: StudyPack,
  origin: 'sample' | 'import',
  sampleFile?: string,
): Promise<InstallSummary | null> {
  try {
    const summary = await installPack(pack, origin, { sampleFile });
    toast.success(`「${pack.title}」を${summary.created ? '追加' : '更新'}しました`, {
      description: describeInstall(summary),
    });
    void useLibrary.getState().refresh();
    return summary;
  } catch (e) {
    toast.error('教材を保存できませんでした', { description: errorMessage(e) });
    return null;
  }
}

export async function installSample(entry: SampleEntry): Promise<boolean> {
  try {
    const result = await parsePackInWorker(await fetchSampleText(entry.file));
    if (!result.ok) throw new Error(result.error);
    return (await installParsedPack(result.pack, 'sample', entry.file)) !== null;
  } catch (e) {
    toast.error('サンプル教材を読み込めませんでした', { description: errorMessage(e) });
    return false;
  }
}
