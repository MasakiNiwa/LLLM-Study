import { useEffect } from 'react';
import { llm } from '@/lib/llm/client';
import { subscribeSharedModels } from '@/lib/llm/modelStorage';
import { useChat } from '@/features/chat/chatStore';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings } from '@/features/settings/settingsStore';

/**
 * 起動時の処理:
 * - チャット履歴（IndexedDB）の読み込み
 * - 保存済みモデル一覧の取得（同じ github.io の他のサイトが保存したモデルも含む）
 * - 前回のモデルの自動読み込み（設定でオン かつ 保存領域に存在する場合）
 * - それ以外はアイドル時に Wasm ランタイムを先読みして初回読み込みを速くする
 */
const idle: (cb: () => void) => void =
  typeof requestIdleCallback === 'function'
    ? (cb) => requestIdleCallback(cb, { timeout: 3000 })
    : (cb) => setTimeout(cb, 1500);

export function useStartup() {
  useEffect(() => {
    let cancelled = false;
    void useChat.getState().init();
    void useEngine.getState().detectWebGpu();
    (async () => {
      const { autoLoadLastModel, lastModelName } = useSettings.getState();
      await useEngine.getState().refreshStoredModels();
      if (cancelled) return;
      const stored = useEngine.getState().storedModels;
      if (autoLoadLastModel && lastModelName && stored.some((m) => m.name === lastModelName)) {
        void useEngine.getState().load({ kind: 'stored', name: lastModelName });
        return;
      }
      idle(() => {
        // モデルがあるときだけ先読みする（学習だけ使う人には Wasm を読み込まない）
        if (!cancelled && stored.length > 0 && useEngine.getState().status === 'empty') {
          llm.warmup().catch((e) => console.warn('Wasm の先読みに失敗しました', e));
        }
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // 同じ github.io の他のサイト・タブでモデルが保存・削除されたら一覧を更新する
  useEffect(() => {
    const refresh = () => void useEngine.getState().refreshStoredModels();
    const unsubscribe = subscribeSharedModels(refresh);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}
