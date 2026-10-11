import { toast } from 'sonner';
import { registerSW } from 'virtual:pwa-register';

/**
 * Service Worker を登録する（PWA・オフライン起動・Wasm のキャッシュ）。
 * 新しいバージョンがあればトーストで知らせ、ユーザーが選んだときだけ更新する。
 */
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  const updateSW = registerSW({
    onNeedRefresh() {
      toast('新しいバージョンがあります', {
        description: '更新すると最新版で再読み込みします',
        duration: Infinity,
        action: { label: '更新', onClick: () => void updateSW(true) },
      });
    },
    onOfflineReady() {
      toast.success('オフラインでも起動できるようになりました');
    },
  });
}
