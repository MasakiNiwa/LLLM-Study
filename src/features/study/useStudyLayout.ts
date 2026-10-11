import { useSyncExternalStore } from 'react';
import { STUDY_FONT_SCALES, useSettings } from '@/features/settings/settingsStore';

/** この高さより低い画面では、学習画面の余白を自動で詰める */
const SHORT_SCREEN = '(max-height: 760px)';

function subscribe(cb: () => void) {
  const mq = window.matchMedia(SHORT_SCREEN);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/** 学習画面の表示（余白を詰めるか・カードの拡大率） */
export function useStudyLayout(): { compact: boolean; zoom: number } {
  const mode = useSettings((s) => s.studyCompact);
  const scale = useSettings((s) => s.studyFontScale);
  const short = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(SHORT_SCREEN).matches,
    () => false,
  );
  return {
    compact: mode === 'on' || (mode === 'auto' && short),
    zoom: STUDY_FONT_SCALES[scale]?.zoom ?? 1,
  };
}
