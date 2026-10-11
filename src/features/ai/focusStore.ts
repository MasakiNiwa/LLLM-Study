import { create } from 'zustand';

/**
 * AI に「今ユーザーが見ているもの」を伝えるための状態。
 * 学習画面で表示中のカードや、チャットに添付したカードを持つ。
 */
export interface AiFocus {
  /** 学習画面で表示中のカード */
  studyCardId: string | null;
  /** 答えを表示済みか（未表示なら AI は答えを言わないようにする） */
  revealed: boolean;
  /** チャットに添付したカード（「AI に質問」から来たとき） */
  attachedCardId: string | null;
}

interface AiFocusState extends AiFocus {
  setStudyCard: (cardId: string | null, revealed: boolean) => void;
  attach: (cardId: string | null) => void;
}

export const useAiFocus = create<AiFocusState>()((set) => ({
  studyCardId: null,
  revealed: false,
  attachedCardId: null,
  setStudyCard: (studyCardId, revealed) => set({ studyCardId, revealed }),
  attach: (attachedCardId) => set({ attachedCardId }),
}));
