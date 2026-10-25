/**
 * AI への入口。設定の「AI の接続先」に応じて、端末内のモデル（lib/llm/client.ts）か
 * クラウド AI（lib/cloud/gemini.ts）に振り分ける。呼び出し側（チャット・解説・ひとことなど）は区別しない。
 *
 * - クラウド AI が回数の上限・通信エラーで答えられず、端末内のモデルが読み込み済みなら、端末内で答え直す
 * - キーがロック中で端末内のモデルがあれば、端末内で答える（解除はユーザーが「AI モデル」画面で行う）
 */
import { toast } from 'sonner';
import { llm } from '@/lib/llm/client';
import { CloudError, geminiGenerate } from '@/lib/cloud/gemini';
import { getUnlockedKey } from '@/lib/cloud/keyVault';
import type {
  GenerateEvent,
  GenerateRequest,
  GenerateResult,
  JsonValue,
  ToolCallInfo,
} from '@/lib/llm/types';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings } from '@/features/settings/settingsStore';
import { useCloud } from './cloudStore';

let current: AbortController | null = null;

const localReady = () => useEngine.getState().status === 'ready';

/** クラウド AI で生成できる状態か（接続先がクラウドで、キーが解除済みで、モデルが決まっている） */
export function cloudReady(): boolean {
  const s = useSettings.getState();
  return s.aiProvider === 'gemini' && !!s.geminiModel && !!getUnlockedKey('gemini');
}

/** AI を使える状態か（クラウドか、端末内のモデルのどちらかで答えられる） */
export function aiReadyNow(): boolean {
  return cloudReady() || localReady();
}

/** 画面用: AI を使える状態か */
export function useAiReady(): boolean {
  const local = useEngine((s) => s.status === 'ready');
  const provider = useSettings((s) => s.aiProvider);
  const model = useSettings((s) => s.geminiModel);
  const unlocked = useCloud((s) => s.unlocked);
  return local || (provider === 'gemini' && !!model && unlocked);
}

let notifiedLocked = false;

export const ai = {
  async generate(
    req: GenerateRequest,
    onEvent: (e: GenerateEvent) => void,
    onToolCall?: (call: ToolCallInfo) => Promise<JsonValue>,
  ): Promise<GenerateResult> {
    const s = useSettings.getState();
    if (s.aiProvider === 'gemini') {
      const apiKey = getUnlockedKey('gemini');
      if (apiKey && s.geminiModel) {
        const ctrl = new AbortController();
        current = ctrl;
        let emitted = false;
        try {
          return await geminiGenerate(
            req,
            { apiKey, model: s.geminiModel, signal: ctrl.signal },
            (e) => {
              emitted = true;
              onEvent(e);
            },
            onToolCall,
          );
        } catch (e) {
          // まだ何も出していなければ、端末内のモデルで答え直す（途中まで出ていたら重ならないよう諦める）
          if (e instanceof CloudError && e.retryable && !emitted && localReady()) {
            toast.info('Gemini が使えなかったので、端末内の AI で答えます', {
              description: e.message,
            });
            return llm.generate(req, onEvent, onToolCall);
          }
          throw e;
        } finally {
          if (current === ctrl) current = null;
        }
      }
      if (!localReady()) {
        throw new Error(
          apiKey
            ? 'Gemini のモデルが選ばれていません。「AI モデル」画面で選んでください。'
            : 'Gemini の API キーがロックされています。「AI モデル」画面で合言葉を入れて解除してください。',
        );
      }
      if (!notifiedLocked) {
        notifiedLocked = true;
        toast.info('Gemini のキーがロック中なので、端末内の AI で答えます', {
          description: '「AI モデル」画面で合言葉を入れると Gemini に切り替わります。',
        });
      }
    }
    return llm.generate(req, onEvent, onToolCall);
  },

  cancel(): void {
    current?.abort();
    llm.cancel();
  },

  /** 端末内のモデルの会話（KV キャッシュ）を捨てる。クラウド AI は毎回履歴を送るので何もしない */
  resetConversation(): Promise<void> {
    return llm.resetConversation();
  },
};
