import { toast } from 'sonner';
import { exportBackup } from '@/lib/db/backup';
import { downloadText } from '@/lib/utils/download';
import { errorMessage } from '@/lib/utils/format';
import { useSettings } from '@/features/settings/settingsStore';

/** 学習データを端末のファイルに書き出し、書き出した日時を覚える（ホームの案内・設定画面から使う） */
export async function backupNow(): Promise<boolean> {
  try {
    const data = await exportBackup();
    downloadText(
      `lllm-study-backup-${data.exportedAt.slice(0, 10)}.json`,
      JSON.stringify(data),
      'application/json',
    );
    useSettings.getState().update({ lastBackupAt: Date.now() });
    toast.success('バックアップを書き出しました');
    return true;
  } catch (e) {
    toast.error('書き出しに失敗しました', { description: errorMessage(e) });
    return false;
  }
}
