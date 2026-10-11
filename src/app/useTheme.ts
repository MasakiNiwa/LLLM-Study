import { useEffect } from 'react';
import { useSettings } from '@/features/settings/settingsStore';

/** 設定のテーマを <html> の dark クラスに反映する */
export function useTheme() {
  const theme = useSettings((s) => s.theme);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.documentElement.classList.toggle('dark', dark);
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme]);
}
