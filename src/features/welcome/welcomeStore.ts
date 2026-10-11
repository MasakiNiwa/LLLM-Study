import { create } from 'zustand';

/** はじめての案内を開いているか（ヘルプ画面などからもう一度開ける） */
export const useWelcome = create<{ open: boolean }>(() => ({ open: false }));

export function openWelcome() {
  useWelcome.setState({ open: true });
}
