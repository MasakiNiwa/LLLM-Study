import { create } from 'zustand';

/**
 * エンジンは同時に 1 つしか生成できないので、誰が使っているかを共有する。
 * chat: チャット、assist: カードの解説など、reaction: 評価へのひとこと
 */
export type AiTask = 'chat' | 'assist' | 'reaction' | 'practice';

export const useAiBusy = create<{ task: AiTask | null }>()(() => ({ task: null }));

export function isAiBusy(): boolean {
  return useAiBusy.getState().task !== null;
}
