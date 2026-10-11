/**
 * AI とのチャット（1 本の会話を IndexedDB に保存して続ける）。
 *
 * - 送信するたびに、アプリの状態（今日の学習状況・見ているカード）を構造化データにして
 *   ユーザーの発話の前に付ける（前回と同じなら付けない＝KV キャッシュを活かす）
 * - AI はツールで学習記録を調べられる（実行はメインスレッドのプログラム）
 */
import { toast } from 'sonner';
import { create } from 'zustand';
import { db } from '@/lib/db/db';
import type { ChatRecord } from '@/lib/db/types';
import { llm } from '@/lib/llm/client';
import type { ChatTurn, GenerationStats } from '@/lib/llm/types';
import { errorMessage } from '@/lib/utils/format';
import { createId } from '@/lib/utils/id';
import { useAiBusy } from '@/features/ai/aiBusy';
import { estimateTokens, trimHistory } from './historyBudget';
import { useAiFocus } from '@/features/ai/focusStore';
import { getConversationSettings } from '@/features/ai/prompt';
import { buildAppState, formatAppState } from '@/features/ai/studyContext';
import { executeTool, TOOL_DECLARATIONS, TOOL_LABELS } from '@/features/ai/tools';
import { useEngine } from '@/features/engine/engineStore';
import { useLibrary } from '@/features/library/libraryStore';
import { useSettings } from '@/features/settings/settingsStore';
import { addUserItem } from '@/lib/packs/userPack';
import { splitThinking } from './thinking';

export interface ChatMessage extends ChatRecord {
  status?: 'streaming' | 'done' | 'cancelled' | 'error';
  stats?: GenerationStats;
}

interface ChatState {
  ready: boolean;
  messages: ChatMessage[];
  isGenerating: boolean;
  /** 実行中のツールの表示名 */
  toolActivity: string | null;
  init: () => Promise<void>;
  send: (text: string) => Promise<void>;
  regenerate: () => Promise<void>;
  stop: () => void;
  clear: () => Promise<void>;
  /** DB の内容で表示を作り直す（バックアップの復元のあとなど。DB は消さない） */
  reload: () => Promise<void>;
  /** AI が提案したカードをマイカードに追加する */
  addProposal: (messageId: string, index: number) => Promise<void>;
}

function toHistory(messages: ChatMessage[]): ChatTurn[] {
  return messages
    .filter((m) => m.role === 'user' || (m.status !== 'error' && m.text))
    .map((m) => ({
      id: m.id,
      role: m.role,
      text: m.role === 'user' && m.context ? `${m.context}\n\n${m.text}` : m.text,
    }));
}

/** 直近でモデルに渡したアプリの状態 */
function lastContext(messages: ChatMessage[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].context) return messages[i].context;
  }
  return undefined;
}

function persistMessage(m: ChatMessage): void {
  const { status: _s, stats: _st, ...record } = m;
  void db.chat.put(record).catch((e) => console.warn('チャットを保存できませんでした', e));
}

export const useChat = create<ChatState>()((set, get) => {
  let initPromise: Promise<void> | null = null;

  const generate = async (history: ChatMessage[], user: ChatMessage) => {
    if (useEngine.getState().status !== 'ready') {
      toast.error('AI モデルが読み込まれていません', {
        description: '「モデル」画面でモデルを読み込んでください',
      });
      return;
    }
    if (useAiBusy.getState().task) {
      toast.info('AI が別の応答を生成中です。少し待ってから送ってください');
      return;
    }
    const settings = useSettings.getState();
    const tools = settings.useTools;
    const assistantId = createId();
    const assistant: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      text: '',
      createdAt: Date.now(),
      status: 'streaming',
    };
    set({ messages: [...history, user, assistant], isGenerating: true, toolActivity: null });
    useAiBusy.setState({ task: 'chat' });
    persistMessage(user);

    const patchAssistant = (patch: Partial<ChatMessage>) =>
      set((st) => ({
        messages: st.messages.map((m) => (m.id === assistantId ? { ...m, ...patch } : m)),
      }));

    // トークンはフレーム単位にまとめて描画する（再描画回数を最小化）
    let textBuf = '';
    let thoughtBuf = '';
    const usedTools: string[] = [];
    let dirty = false;
    let raf = 0;
    const view = () => {
      const { answer, thought } = splitThinking(textBuf);
      const thinking = [thoughtBuf, thought].filter(Boolean).join('\n') || undefined;
      return { text: answer, thinking };
    };
    const flush = () => {
      raf = 0;
      if (!dirty) return;
      dirty = false;
      patchAssistant(view());
    };

    try {
      const conversation = getConversationSettings(settings, { tools });
      const messageText = user.context ? `${user.context}\n\n${user.text}` : user.text;
      // 会話が長くなっても文脈長を超えないよう、古い履歴から削って渡す
      const trimmed = trimHistory(toHistory(history), {
        maxNumTokens: settings.maxNumTokens,
        maxOutputTokens: settings.maxOutputTokens,
        reserved:
          estimateTokens(conversation.systemPrompt ?? '') +
          (tools ? estimateTokens(JSON.stringify(TOOL_DECLARATIONS)) : 0) +
          estimateTokens(messageText) +
          64,
      });
      const result = await llm.generate(
        {
          mode: 'chat',
          settings: conversation,
          history: trimmed,
          message: {
            id: user.id,
            role: 'user',
            text: messageText,
          },
          assistantId,
          tools: tools ? TOOL_DECLARATIONS : undefined,
        },
        (ev) => {
          if (ev.type === 'tool-call') {
            usedTools.push(ev.call.name);
            set({ toolActivity: TOOL_LABELS[ev.call.name] ?? ev.call.name });
            return;
          }
          if (ev.type === 'tool-result') {
            set({ toolActivity: null });
            return;
          }
          if (ev.type !== 'delta') return;
          if (ev.channel) thoughtBuf += ev.text;
          else textBuf += ev.text;
          dirty = true;
          if (!raf) raf = requestAnimationFrame(flush);
        },
        tools
          ? (call) =>
              executeTool(call, useSettings.getState(), {
                onProposal: (draft) =>
                  set((st) => ({
                    messages: st.messages.map((m) =>
                      m.id === assistantId
                        ? { ...m, proposals: [...(m.proposals ?? []), { draft }] }
                        : m,
                    ),
                  })),
              })
          : undefined,
      );
      cancelAnimationFrame(raf);
      dirty = true;
      flush();
      patchAssistant({
        status: result.status,
        stats: result.stats,
        tools: usedTools.length ? usedTools : undefined,
      });
    } catch (e) {
      cancelAnimationFrame(raf);
      const message = errorMessage(e);
      console.error(e);
      patchAssistant({ ...view(), status: 'error', error: message });
      toast.error('生成中にエラーが発生しました', { description: message });
    } finally {
      useAiBusy.setState({ task: null });
      set({ isGenerating: false, toolActivity: null });
      const saved = get().messages.find((m) => m.id === assistantId);
      if (saved) persistMessage(saved);
    }
  };

  /** 送信する発話に付けるアプリの状態（前回と同じなら付けない） */
  const contextFor = async (history: ChatMessage[]): Promise<string | undefined> => {
    const settings = useSettings.getState();
    if (!settings.shareStudyState) return undefined;
    try {
      const focus = useAiFocus.getState();
      const state = await buildAppState(settings, {
        page: 'chat',
        focusCardId: focus.attachedCardId ?? undefined,
        revealed: true,
      });
      const text = formatAppState(state);
      // 時刻だけが違う場合も付け直さない
      const normalize = (s: string | undefined) => s?.replace(/"now":"[^"]*",?/, '');
      return normalize(text) === normalize(lastContext(history)) ? undefined : text;
    } catch (e) {
      console.warn('アプリの状態を取得できませんでした', e);
      return undefined;
    }
  };

  return {
    ready: false,
    messages: [],
    isGenerating: false,
    toolActivity: null,

    init() {
      initPromise ??= (async () => {
        try {
          const records = await db.chat.orderBy('createdAt').toArray();
          set({ messages: records.map((r) => ({ ...r, status: r.error ? 'error' : 'done' })) });
        } catch (e) {
          console.warn('チャット履歴を読み込めませんでした', e);
        }
        set({ ready: true });
      })();
      return initPromise;
    },

    async send(text) {
      const trimmed = text.trim();
      if (!trimmed || get().isGenerating) return;
      const history = get().messages;
      const user: ChatMessage = {
        id: createId(),
        role: 'user',
        text: trimmed,
        context: await contextFor(history),
        createdAt: Date.now(),
        status: 'done',
      };
      await generate(history, user);
    },

    async regenerate() {
      const { messages, isGenerating } = get();
      if (isGenerating) return;
      let i = messages.length - 1;
      while (i >= 0 && messages[i].role !== 'user') i--;
      if (i < 0) return;
      const removed = messages.slice(i + 1).map((m) => m.id);
      if (removed.length) await db.chat.bulkDelete(removed);
      await generate(messages.slice(0, i), messages[i]);
    },

    stop() {
      if (get().isGenerating) llm.cancel();
    },

    async addProposal(messageId, index) {
      const message = get().messages.find((m) => m.id === messageId);
      const proposal = message?.proposals?.[index];
      if (!message || !proposal || proposal.added) return;
      try {
        await addUserItem(proposal.draft);
        const updated: ChatMessage = {
          ...message,
          proposals: message.proposals!.map((p, i) => (i === index ? { ...p, added: true } : p)),
        };
        set((st) => ({ messages: st.messages.map((m) => (m.id === messageId ? updated : m)) }));
        persistMessage(updated);
        void useLibrary.getState().refresh();
        toast.success('マイカードに追加しました', { description: '次の学習から出題されます' });
      } catch (e) {
        toast.error('追加できませんでした', { description: errorMessage(e) });
      }
    },

    async reload() {
      if (get().isGenerating) llm.cancel();
      useAiFocus.getState().attach(null);
      // 会話の内容が入れ替わるので、モデル側の会話（KV キャッシュ）も作り直す
      void llm.resetConversation();
      const records = await db.chat.orderBy('createdAt').toArray();
      set({ messages: records.map((r) => ({ ...r, status: r.error ? 'error' : 'done' })) });
    },

    async clear() {
      if (get().isGenerating) llm.cancel();
      set({ messages: [] });
      useAiFocus.getState().attach(null);
      void llm.resetConversation();
      await db.chat.clear();
    },
  };
});
