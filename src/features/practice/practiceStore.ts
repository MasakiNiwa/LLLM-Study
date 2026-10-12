/**
 * 会話練習の状態。会話は保存しない（練習ごとに新しく始める）。
 * AI の会話は Worker のチャット用の会話（KV キャッシュ）を使い、メインのチャットとは履歴を分ける。
 */
import { toast } from 'sonner';
import { create } from 'zustand';
import { llm } from '@/lib/llm/client';
import type { ChatTurn } from '@/lib/llm/types';
import { errorMessage } from '@/lib/utils/format';
import { createId } from '@/lib/utils/id';
import { useAiBusy } from '@/features/ai/aiBusy';
import { isAiBusyExceptReaction, preemptReaction, runOneshot } from '@/features/ai/oneshot';
import { splitThinking } from '@/features/chat/thinking';
import { estimateTokens, trimHistory } from '@/features/chat/historyBudget';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings } from '@/features/settings/settingsStore';
import {
  feedbackPrompt,
  OPENING_MESSAGE,
  parseFeedback,
  rolePlayPrompt,
  splitTranslation,
  type Feedback,
  type PracticeConfig,
} from './scenarios';

export interface PracticeMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  /** 画面に出さない（最初の合図） */
  hidden?: boolean;
  streaming?: boolean;
}

interface PracticeState {
  config: PracticeConfig | null;
  messages: PracticeMessage[];
  generating: boolean;
  feedback: Feedback | null;
  feedbackLoading: boolean;
  start: (config: PracticeConfig) => Promise<void>;
  /** 受け付けたら true（入力欄を空にしてよい）、AI が使えない・ほかの処理中なら false */
  send: (text: string) => boolean;
  stop: () => void;
  requestFeedback: () => Promise<void>;
  reset: () => void;
}

export const usePractice = create<PracticeState>()((set, get) => {
  /** 今すぐ生成を始められるか（できなければ理由を知らせる） */
  const canGenerate = (): boolean => {
    if (useEngine.getState().status !== 'ready') {
      toast.error('AI モデルが読み込まれていません');
      return false;
    }
    if (isAiBusyExceptReaction() || get().generating) {
      toast.info('AI が別の応答を生成中です。少し待ってから送ってください');
      return false;
    }
    return true;
  };

  const generate = async (history: PracticeMessage[], user: PracticeMessage) => {
    const config = get().config;
    if (!config || !canGenerate()) return;
    await preemptReaction();
    if (useAiBusy.getState().task) return;
    const s = useSettings.getState();
    const assistantId = createId();
    set({
      messages: [
        ...history,
        user,
        { id: assistantId, role: 'assistant', text: '', streaming: true },
      ],
      generating: true,
    });
    useAiBusy.setState({ task: 'practice' });
    let raw = '';
    let raf = 0;
    const flush = () => {
      raf = 0;
      const text = splitThinking(raw).answer;
      set((st) => ({
        messages: st.messages.map((m) => (m.id === assistantId ? { ...m, text } : m)),
      }));
    };
    const toTurn = (m: PracticeMessage): ChatTurn => ({ id: m.id, role: m.role, text: m.text });
    try {
      const systemPrompt = rolePlayPrompt(config);
      const userTurn = toTurn(user);
      await llm.generate(
        {
          mode: 'chat',
          settings: {
            systemPrompt,
            temperature: s.temperature,
            topK: s.topK,
            topP: s.topP,
            maxOutputTokens: 256,
            enableThinking: false,
          },
          // 長い会話でも文脈長を超えないよう、古い発言から削って渡す
          history: trimHistory(history.filter((m) => m.text).map(toTurn), {
            maxNumTokens: s.maxNumTokens,
            maxOutputTokens: 256,
            reserved: estimateTokens(systemPrompt) + estimateTokens(userTurn.text) + 64,
          }),
          message: userTurn,
          assistantId,
        },
        (ev) => {
          if (ev.type !== 'delta' || ev.channel) return;
          raw += ev.text;
          if (!raf) raf = requestAnimationFrame(flush);
        },
      );
      cancelAnimationFrame(raf);
      flush();
    } catch (e) {
      cancelAnimationFrame(raf);
      toast.error('AI が応答できませんでした', { description: errorMessage(e) });
    } finally {
      useAiBusy.setState({ task: null });
      set((st) => ({
        generating: false,
        messages: st.messages
          .map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
          .filter((m) => m.role === 'user' || m.text),
      }));
    }
  };

  return {
    config: null,
    messages: [],
    generating: false,
    feedback: null,
    feedbackLoading: false,

    async start(config) {
      if (get().generating) llm.cancel();
      set({ config, messages: [], feedback: null });
      await generate([], { id: createId(), role: 'user', text: OPENING_MESSAGE, hidden: true });
    },

    send(text) {
      const trimmed = text.trim();
      if (!trimmed || !canGenerate()) return false;
      void generate(get().messages, { id: createId(), role: 'user', text: trimmed });
      return true;
    },

    stop() {
      if (get().generating) llm.cancel();
    },

    async requestFeedback() {
      const { config, messages } = get();
      const utterances = messages.filter((m) => m.role === 'user' && !m.hidden).map((m) => m.text);
      if (!config || utterances.length === 0) return;
      set({ feedbackLoading: true });
      try {
        const r = await runOneshot({
          task: 'assist',
          prompt: feedbackPrompt(
            config,
            utterances.slice(-12),
            // 理解を深める練習は、AI の質問と合わせて渡す（何に答えたかが分かるように）
            messages
              .filter((m) => !m.hidden && m.text)
              .slice(-16)
              .map((m) => ({
                role: m.role,
                text: (m.role === 'assistant' ? splitTranslation(m.text).line : m.text).slice(
                  0,
                  400,
                ),
              })),
          ),
          maxOutputTokens: 1024,
          plain: true,
        });
        const fb = parseFeedback(r.text);
        if (!fb) throw new Error('AI の添削結果を読み取れませんでした。もう一度試してください');
        set({ feedback: fb });
      } catch (e) {
        toast.error('添削してもらえませんでした', { description: errorMessage(e) });
      } finally {
        set({ feedbackLoading: false });
      }
    },

    reset() {
      if (get().generating) llm.cancel();
      set({ config: null, messages: [], feedback: null });
    },
  };
});
