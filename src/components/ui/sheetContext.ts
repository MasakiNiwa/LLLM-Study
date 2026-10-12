import { createContext, useContext } from 'react';

export const SheetCloseContext = createContext<() => void>(() => undefined);

/** ボトムシートの中から、アニメーションして閉じる（項目を選んだら閉じる、など） */
export function useSheetClose(): () => void {
  return useContext(SheetCloseContext);
}
