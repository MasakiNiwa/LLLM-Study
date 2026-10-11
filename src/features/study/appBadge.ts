import { setAppBadge } from '@/lib/utils/badge';
import { useSettings } from '@/features/settings/settingsStore';
import { getTodayOverview, type TodayOverview } from './repository';

/** 今日の残りの枚数をアプリのアイコンに出す（設定でオフなら消す） */
export function showAppBadge(overview: TodayOverview | null): void {
  const on = useSettings.getState().appBadge;
  setAppBadge(
    on && overview ? overview.plannedNew + overview.plannedReviews + overview.plannedLearning : 0,
  );
}

/** 今日の状況を読み直してアイコンの数字を更新する（学習を終えたとき・設定を変えたとき） */
export async function refreshAppBadge(): Promise<void> {
  const settings = useSettings.getState();
  if (!settings.appBadge) {
    showAppBadge(null);
    return;
  }
  try {
    showAppBadge(await getTodayOverview(settings));
  } catch {
    // 数字が出せなくても学習には影響しない
  }
}
