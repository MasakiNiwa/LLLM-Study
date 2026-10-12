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
  task: Exclude<AiTask, 'chat' | 'practice'>;
  prompt: string;
  maxOutputTokens?: number;
  /** true: 性格（口調）を付けず、教材づくり用の中立なシステムプロンプトで生成する */
  plain?: boolean;
  /** 生成中の本文（フレームごとにまとめて呼ばれる） */
  onText?: (text: string) => void;
  /**
   * 生成の種類（温度の決め方）。judge: 判定、structured: 決まった形の下書き・添削、
   * varied: 毎回違うものを作る問題づくり、free（既定）: 解説・ひとことなど自由な文章
   */
  purpose?: OneshotPurpose;
  /** 作り直しの回数（0 から）。形が合わずに作り直すたびに、温度を少し上げて違う出力にする */
  attempt?: number;
}

export type OneshotPurpose = 'judge' | 'structured' | 'varied' | 'free';

/** タスクごとの温度。決まった形の出力ほど低くする（0 にすると作り直しても同じ出力になるので避ける） */
const PURPOSE_TEMPERATURE: Record<Exclude<OneshotPurpose, 'free'>, number> = {
  judge: 0.2,
  structured: 0.3,
  varied: 0.7,
};

/**
 * 単発の生成の温度。設定で「タスクごとに温度を変える」がオフなら、いつも設定の温度。
 * 作り直すたびに 0.15 ずつ上げる（上限 1.0）
 */
export function oneshotTemperature(
  purpose: OneshotPurpose,
  attempt: number,
  s: { temperature: number; taskTemperature: boolean },
): number {
  if (!s.taskTemperature || purpose === 'free') return s.temperature;
  return Math.min(1, PURPOSE_TEMPERATURE[purpose] + 0.15 * attempt);
}

export interface OneshotResult {
  text: string;
  cancelled: boolean;
}

/** カードの下書きや問題づくりなど、口調を付けたくない生成に使う */
const PLAIN_SYSTEM_PROMPT =
  'あなたは正確な学習教材を作るアシスタントです。指示された形式どおりに、簡潔で正確な内容だけを出力します。口調や語尾の飾りは付けません。';

/**
 * 評価への「ひとこと」は後回しにしてよい生成なので、ほかの生成を頼まれたら止めて譲る。
 * 止まるまで待つ（長くても数秒）。
 */
export async function preemptReaction(): Promise<void> {
  if (useAiBusy.getState().task !== 'reaction') return;
  llm.cancel();
  await new Promise<void>((resolve) => {
    const timer = setTimeout(done, 3000);
    const unsub = useAiBusy.subscribe((st) => {
      if (st.task === null) done();
    });
    function done() {
      clearTimeout(timer);
      unsub();
      resolve();
    }
  });
}

/** ひとこと以外の生成中か（ひとことは譲ってもらえるので数えない） */
export function isAiBusyExceptReaction(): boolean {
  const task = useAiBusy.getState().task;
  return task !== null && task !== 'reaction';
}

export async function runOneshot(opts: OneshotOptions): Promise<OneshotResult> {
  if (useEngine.getState().status !== 'ready') throw new Error('AI モデルが読み込まれていません');
  if (opts.task !== 'reaction') await preemptReaction();
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
          temperature: oneshotTemperature(opts.purpose ?? 'free', opts.attempt ?? 0, s),
          topK: s.topK,
          topP: s.topP,
          maxOutputTokens: opts.maxOutputTokens ?? s.maxOutputTokens,
          // 単発の生成では考える過程を省いて速く返す
          enableThinking: false,
        },
        history: [],
        message: { id: createId(), role: 'user', text: opts.prompt },
        assistantId: createId(),
        // チャットの文脈（KV キャッシュ）を残したまま生成する（設定でオフにできる）
        keepChat: s.keepChatContext,
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

/**
 * 決まった形（JSON など）の出力を生成して読み取る。読み取れなければ、温度を少し上げて作り直す。
 * 止めたときは cancelled、作り直しても読み取れなければ value が null。
 */
export async function runOneshotParsed<T>(
  opts: Omit<OneshotOptions, 'attempt'>,
  parse: (text: string) => T | null,
  retries = 1,
): Promise<{ value: T | null; cancelled: boolean }> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const r = await runOneshot({ ...opts, attempt });
    if (r.cancelled) return { value: null, cancelled: true };
    const value = parse(r.text);
    if (value !== null) return { value, cancelled: false };
  }
  return { value: null, cancelled: false };
}

export function cancelAi(): void {
  llm.cancel();
}
