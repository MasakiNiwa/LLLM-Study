import { useCallback, useEffect, useState } from 'react';
import { useLibrary } from '@/features/library/libraryStore';
import { useSettings } from '@/features/settings/settingsStore';
import { getTodayOverview, type TodayOverview } from './repository';

/** 今日の学習状況（画面を開いたとき・前面に戻ったときに読み直す） */
export function useTodayOverview(): { overview: TodayOverview | null; reload: () => void } {
  const [overview, setOverview] = useState<TodayOverview | null>(null);
  const newPerDay = useSettings((s) => s.newPerDay);
  const maxReviews = useSettings((s) => s.maxReviewsPerDay);
  const dayStart = useSettings((s) => s.dayStartHour);
  const order = useSettings((s) => s.newCardOrder);
  const unlimited = useSettings((s) => s.noDailyLimit);
  const focus = useSettings((s) => s.focusPackId);
  // 教材の追加・削除・有効化の切り替えでも読み直す
  const packs = useLibrary((s) => s.packs);

  const reload = useCallback(() => {
    void getTodayOverview(useSettings.getState()).then(setOverview, (e) =>
      console.warn('今日の状況を取得できませんでした', e),
    );
  }, []);

  useEffect(() => {
    reload();
  }, [reload, newPerDay, maxReviews, dayStart, order, packs, unlimited, focus]);

  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && reload();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  return { overview, reload };
}
