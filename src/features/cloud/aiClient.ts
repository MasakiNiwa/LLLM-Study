/**
 * AI への入口。設定の「AI の接続先」に応じて、端末内のモデル（lib/llm/client.ts）か
 * クラウド AI（lib/cloud/providers.ts の Gemini・OpenAI・Claude・OpenRouter）に振り分ける。呼び出し側は区別しない。
 *
 * - クラウド AI が回数の上限・通信エラーで答えられず、まだ何も出しておらず、端末内のモデルが読み込み済みなら、端末内で答え直す
 * - キーがロック中で端末内のモデルがあれば、端末内で答える（解除はユーザーがモデルのチップの切り替え・「AI モデル」画面で行う）
 */
import { toast } from 'sonner';
import { llm } from '@/lib/llm/client';
import { CloudError } from '@/lib/cloud/errors';
import { getUnlockedKey, type CloudProviderId } from '@/lib/cloud/keyVault';
import { CLOUD_PROVIDERS } from '@/lib/cloud/providers';
import type {
  GenerateEvent,
  GenerateRequest,
  GenerateResult,
  JsonValue,
  ToolCallInfo,
} from '@/lib/llm/types';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings, type AiProvider } from '@/features/settings/settingsStore';
import { rememberRecentModel, useCloud } from './cloudStore';

let current: AbortController | null = null;

const localReady = () => useEngine.getState().status === 'ready';

const asCloud = (p: AiProvider): CloudProviderId | null => (p === 'local' ? null : p);

/** クラウド AI で生成できる状態か（接続先がクラウドで、キーが解除済みで、モデルが決まっている） */
export function cloudReady(): boolean {
  const s = useSettings.getState();
  const p = asCloud(s.aiProvider);
  return !!p && !!s.cloudModels[p] && !!getUnlockedKey(p);
}

/** AI を使える状態か（クラウドか、端末内のモデルのどちらかで答えられる） */
export function aiReadyNow(): boolean {
  return cloudReady() || localReady();
}

/** 画面用: AI を使える状態か */
export function useAiReady(): boolean {
  const local = useEngine((s) => s.status === 'ready');
  const provider = useSettings((s) => asCloud(s.aiProvider));
  const model = useSettings((s) => (provider ? s.cloudModels[provider] : undefined));
  const unlocked = useCloud((s) => (provider ? s.unlocked[provider] : false));
  return local || (!!provider && !!model && unlocked);
}

let notifiedLocked = false;

export const ai = {
  async generate(
    req: GenerateRequest,
    onEvent: (e: GenerateEvent) => void,
    onToolCall?: (call: ToolCallInfo) => Promise<JsonValue>,
  ): Promise<GenerateResult> {
    const s = useSettings.getState();
    const provider = asCloud(s.aiProvider);
    if (provider) {
      const info = CLOUD_PROVIDERS[provider];
      const apiKey = getUnlockedKey(provider);
      const model = s.cloudModels[provider];
      if (apiKey && model) {
        const ctrl = new AbortController();
        current = ctrl;
        let emitted = false;
        try {
          const result = await info.generate(
            req,
            { apiKey, model, signal: ctrl.signal },
            (e) => {
              emitted = true;
              onEvent(e);
            },
            onToolCall,
          );
          if (result.status === 'done') rememberRecentModel(provider, model);
          return result;
        } catch (e) {
          // まだ何も出していなければ、端末内のモデルで答え直す（途中まで出ていたら重ならないよう諦める）
          if (e instanceof CloudError && e.retryable && !emitted && localReady()) {
            toast.info(`${info.label} が使えなかったので、端末内の AI で答えます`, {
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
            ? `${info.label} のモデルが選ばれていません。「AI モデル」画面で選んでください。`
            : `${info.label} の API キーがロックされています。画面上のモデルのチップを押して、合言葉で解除してください。`,
        );
      }
      if (!notifiedLocked) {
        notifiedLocked = true;
        toast.info(`${info.label} のキーがロック中なので、端末内の AI で答えます`, {
          description: `モデルのチップを押して合言葉を入れると ${info.label} に切り替わります。`,
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
