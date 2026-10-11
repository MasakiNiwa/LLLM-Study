import { useEffect, useState } from 'react';
import { studyDayKey } from '@/lib/srs/day';
import { useSettings } from '@/features/settings/settingsStore';

/** 今日の学習日（YYYY-MM-DD）。画面が前面に戻ったときに日付をまたいでいれば更新する */
export function useStudyToday(): string {
  const dayStart = useSettings((s) => s.dayStartHour);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const onVisible = () => document.visibilityState === 'visible' && setNow(Date.now());
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  return studyDayKey(now, dayStart);
}
