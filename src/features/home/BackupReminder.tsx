import { useEffect, useState } from 'react';
import { DatabaseBackup } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { db } from '@/lib/db/db';
import { useSettings } from '@/features/settings/settingsStore';
import { backupNow } from './backup';

const DAY = 86_400_000;
/** この日数バックアップしていなければ案内する */
const REMIND_AFTER_DAYS = 14;
/** 案内を出すのに必要な学習記録の数（始めたばかりの人には出さない） */
const MIN_REVIEWS = 50;

/**
 * しばらくバックアップしていないときの案内。
 * データはブラウザの中だけにあるので、端末の故障やデータ削除に備えて書き出しをすすめる。
 */
export function BackupReminder() {
  const last = useSettings((s) => s.lastBackupAt);
  const snooze = useSettings((s) => s.backupSnoozeUntil);
  const update = useSettings((s) => s.update);
  const [state, setState] = useState<{ show: boolean; days: number | null }>({
    show: false,
    days: null,
  });

  useEffect(() => {
    let cancelled = false;
    void db.reviews.count().then((count) => {
      const now = Date.now();
      const days = last ? Math.floor((now - last) / DAY) : null;
      const due = days === null || days >= REMIND_AFTER_DAYS;
      if (!cancelled) {
        setState({ show: count >= MIN_REVIEWS && due && !(snooze && snooze > now), days });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [last, snooze]);

  if (!state.show) return null;
  return (
    <Card className="flex flex-wrap items-center gap-3 border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/30">
      <DatabaseBackup className="size-5 shrink-0 text-amber-600" />
      <div className="min-w-0 flex-1 text-sm">
        <div className="font-semibold">学習データをバックアップしませんか？</div>
        <p className="text-slate-600 dark:text-slate-400">
          {state.days === null
            ? 'まだ一度も書き出していません。'
            : `最後の書き出しから ${state.days} 日たっています。`}
          学習記録はこの端末のブラウザの中だけにあります。
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => update({ backupSnoozeUntil: Date.now() + 7 * DAY })}
        >
          あとで
        </Button>
        <Button size="sm" variant="primary" onClick={() => void backupNow()}>
          書き出す
        </Button>
      </div>
    </Card>
  );
}
