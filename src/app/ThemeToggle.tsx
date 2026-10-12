import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useSettings } from '@/features/settings/settingsStore';

/** 今ダークモードで表示しているか（「端末に合わせる」のときは端末の設定） */
function useIsDark(): boolean {
  const theme = useSettings((s) => s.theme);
  const systemDark = useSyncExternalStore(
    (onChange) => {
      const media = matchMedia('(prefers-color-scheme: dark)');
      media.addEventListener('change', onChange);
      return () => media.removeEventListener('change', onChange);
    },
    () => matchMedia('(prefers-color-scheme: dark)').matches,
    () => false,
  );
  return theme === 'dark' || (theme === 'system' && systemDark);
}

/** ヘッダーのライト・ダークの切り替え（押すと今と反対のテーマに固定する） */
export function ThemeToggle({ className }: { className?: string }) {
  const dark = useIsDark();
  const update = useSettings((s) => s.update);
  const label = dark ? 'ライトモードにする' : 'ダークモードにする';
  return (
    <button
      type="button"
      onClick={() => update({ theme: dark ? 'light' : 'dark' })}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800',
        className,
      )}
    >
      {dark ? <Sun className="size-5" /> : <Moon className="size-5" />}
    </button>
  );
}
