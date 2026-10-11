/**
 * 履歴を持たない単発の生成（カードの解説・例文・ひとことなど）。
 * チャットの会話（KV キャッシュ）とは別に毎回作り直す。
 */
import { llm } from '@/lib/llm/client';
import { useSettings } from '@/features/settings/settingsStore';
import { useEngine } from '@/features/engine/engineStore';
import { splitThinking } from '@/features/chat/thinking';
import { createId } from '@/lib/utils/id';
import { buildSystemPrompt } from './prompt';
import { useAiBusy, type AiTask } from './aiBusy';

export interface OneshotOptions {
  task: Exclude<AiTask, 'chat'>;
  prompt: string;
  maxOutputTokens?: number;
  /** true: 性格（口調）を付けず、教材づくり用の中立なシステムプロンプトで生成する */
  plain?: boolean;
  /** 生成中の本文（フレームごとにまとめて呼ばれる） */
  onText?: (text: string) => void;
}

export interface OneshotResult {
  text: string;
  cancelled: boolean;
}

/** カードの下書きや問題づくりなど、口調を付けたくない生成に使う */
const PLAIN_SYSTEM_PROMPT =
  'あなたは正確な学習教材を作るアシスタントです。指示された形式どおりに、簡潔で正確な内容だけを出力します。口調や語尾の飾りは付けません。';

export async function runOneshot(opts: OneshotOptions): Promise<OneshotResult> {
  if (useEngine.getState().status !== 'ready') throw new Error('AI モデルが読み込まれていません');
  if (useAiBusy.getState().task) throw new Error('AI が別の応答を生成中です');
  useAiBusy.setState({ task: opts.task });
  const s = useSettings.getState();
  let raw = '';
  let raf = 0;
  const flush = () => {
    raf = 0;
    opts.onText?.(splitThinking(raw).answer);
  };
  try {
    const result = await llm.generate(
      {
        mode: 'oneshot',
        settings: {
          systemPrompt: opts.plain ? PLAIN_SYSTEM_PROMPT : buildSystemPrompt(s, { tools: false }),
          temperature: s.temperature,
          topK: s.topK,
          topP: s.topP,
          maxOutputTokens: opts.maxOutputTokens ?? s.maxOutputTokens,
          // 単発の生成では考える過程を省いて速く返す
          enableThinking: false,
        },
        history: [],
        message: { id: createId(), role: 'user', text: opts.prompt },
        assistantId: createId(),
      },
      (ev) => {
        if (ev.type !== 'delta' || ev.channel) return;
        raw += ev.text;
        if (!raf) raf = requestAnimationFrame(flush);
      },
    );
    cancelAnimationFrame(raf);
    flush();
    return { text: splitThinking(raw).answer.trim(), cancelled: result.status === 'cancelled' };
  } finally {
    cancelAnimationFrame(raf);
    useAiBusy.setState({ task: null });
  }
}

export function cancelAi(): void {
  llm.cancel();
}
