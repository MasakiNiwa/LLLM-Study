import { useEffect } from 'react';
import { useSettings } from '@/features/settings/settingsStore';

/** CSS の色（oklch など）を #rrggbb にする（theme-color は古い形式の方が確実に効く） */
function toHex(color: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d');
  if (!ctx) return color;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** ブラウザのアドレスバーなどの色を、今の背景色に合わせる */
function syncThemeColor() {
  const color = toHex(getComputedStyle(document.body).backgroundColor);
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]:not([media])');
  if (!meta) {
    // 初期表示用の（端末の設定で切り替わる）指定は外し、アプリの設定に合わせた 1 つにする
    document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = color;
}

/** 設定のテーマを <html> の dark クラスと、ダークモードの配色（data-dark-palette）に反映する */
export function useTheme() {
  const theme = useSettings((s) => s.theme);
  const palette = useSettings((s) => s.darkPalette);
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      const root = document.documentElement;
      root.classList.toggle('dark', dark);
      root.dataset.darkPalette = palette;
      root.style.colorScheme = dark ? 'dark' : 'light';
      syncThemeColor();
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme, palette]);
}
