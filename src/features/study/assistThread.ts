import { create } from 'zustand';
import { createId } from '@/lib/utils/id';
import { errorMessage } from '@/lib/utils/format';
import { useAiBusy } from '@/features/ai/aiBusy';
import { cancelAi, runOneshot } from '@/features/ai/oneshot';
import type { ChatTurn } from '@/lib/llm/types';

/**
 * 学習画面の「AI に聞く」のやりとり（カードの表示ごと）。
 * 画面を離れて戻っても、次のカードに進むまでは残す。質問は前のやりとりの下に続けて並べ、
 * 前のやりとりを踏まえて答えてもらう。
 */
export interface AssistEntry {
  id: string;
  /** 画面に出す質問（ボタンの名前か、書いた質問） */
  question: string;
  text: string;
  status: 'running' | 'done' | 'error';
}

interface AssistThreadState {
  /** どのカードの表示のやりとりか（カードの id と表示した時刻） */
  key: string | null;
  entries: AssistEntry[];
  /** カードの表示が変わったら、やりとりを捨てる（生成中なら止める） */
  open: (key: string) => void;
  ask: (key: string, question: string, prompt: string) => Promise<void>;
}

/** 前のやりとりを何回分まで渡すか（端末内の AI の文脈を使い切らないように） */
const HISTORY_ENTRIES = 3;

export const useAssistThread = create<AssistThreadState>()((set, get) => ({
  key: null,
  entries: [],

  open(key) {
    if (get().key === key) return;
    if (get().entries.some((e) => e.status === 'running') && useAiBusy.getState().task === 'assist')
      cancelAi();
    set({ key, entries: [] });
  },

  async ask(key, question, prompt) {
    if (get().key !== key) return;
    const history: ChatTurn[] = get()
      .entries.filter((e) => e.status === 'done')
      .slice(-HISTORY_ENTRIES)
      .flatMap((e) => [
        { id: `${e.id}-q`, role: 'user' as const, text: e.question },
        { id: e.id, role: 'assistant' as const, text: e.text },
      ]);
    const id = createId();
    const patch = (p: Partial<AssistEntry>) => {
      if (get().key !== key) return;
      set((st) => ({ entries: st.entries.map((e) => (e.id === id ? { ...e, ...p } : e)) }));
    };
    set((st) => ({ entries: [...st.entries, { id, question, text: '', status: 'running' }] }));
    try {
      const r = await runOneshot({
        task: 'assist',
        prompt,
        history,
        onText: (text) => patch({ text }),
      });
      patch({
        text: r.text || (r.cancelled ? '（止めました）' : '（応答がありませんでした）'),
        status: 'done',
      });
    } catch (e) {
      patch({ text: `AI に聞けませんでした: ${errorMessage(e)}`, status: 'error' });
    }
  },
}));
