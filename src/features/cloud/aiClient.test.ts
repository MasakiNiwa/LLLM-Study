import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GenerateRequest } from '@/lib/llm/types';

const localGenerate = vi.fn(async () => ({ status: 'done' as const, stats: { totalMs: 1 } }));
const geminiGenerate = vi.fn();
let unlockedKey: string | null = 'KEY';

vi.mock('@/lib/llm/client', () => ({
  llm: { generate: localGenerate, cancel: vi.fn(), resetConversation: vi.fn(async () => {}) },
}));
vi.mock('@/lib/cloud/keyVault', () => ({
  getUnlockedKey: () => unlockedKey,
  isUnlocked: () => unlockedKey !== null,
  storedKeyInfo: () => null,
  hasPendingKey: () => false,
  isLegacyKey: () => false,
  vaultState: () => 'none',
  subscribeVault: () => () => {},
}));
vi.mock('@/lib/cloud/gemini', async (orig) => ({
  ...(await orig<typeof import('@/lib/cloud/gemini')>()),
  geminiGenerate: (...args: unknown[]) => geminiGenerate(...args),
}));
const openaiGenerate = vi.fn();
vi.mock('@/lib/cloud/openai', async (orig) => ({
  ...(await orig<typeof import('@/lib/cloud/openai')>()),
  openaiGenerate: (...args: unknown[]) => openaiGenerate(...args),
}));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn(), success: vi.fn() } }));

const { ai, aiReadyNow } = await import('./aiClient');
const { CloudError } = await import('@/lib/cloud/gemini');
const { useSettings } = await import('@/features/settings/settingsStore');
const { useEngine } = await import('@/features/engine/engineStore');

const req = {
  settings: {
    systemPrompt: '',
    temperature: 1,
    topK: 1,
    topP: 1,
    maxOutputTokens: 1,
    enableThinking: false,
  },
  history: [],
  message: { id: 'm', role: 'user', text: 'hi' },
  assistantId: 'a',
} as GenerateRequest;

beforeEach(() => {
  localGenerate.mockClear();
  geminiGenerate.mockReset();
  openaiGenerate.mockReset();
  unlockedKey = 'KEY';
  useSettings.setState({
    aiProvider: 'gemini',
    cloudModels: { gemini: 'gemini-test' },
    taskModels: {},
  });
  useEngine.setState({ status: 'empty' });
});

describe('aiClient', () => {
  it('接続先が Gemini で解除済みなら Gemini で生成する', async () => {
    geminiGenerate.mockResolvedValue({ status: 'done', stats: { totalMs: 1 } });
    expect(aiReadyNow()).toBe(true);
    await ai.generate(req, () => {});
    expect(geminiGenerate).toHaveBeenCalledOnce();
    expect(geminiGenerate.mock.calls[0][1]).toMatchObject({ apiKey: 'KEY', model: 'gemini-test' });
    expect(localGenerate).not.toHaveBeenCalled();
  });

  it('接続先が OpenAI なら OpenAI のキーとモデルで生成する', async () => {
    useSettings.setState({ aiProvider: 'openai', cloudModels: { openai: 'gpt-test-mini' } });
    openaiGenerate.mockResolvedValue({ status: 'done', stats: { totalMs: 1 } });
    await ai.generate(req, () => {});
    expect(openaiGenerate).toHaveBeenCalledOnce();
    expect(openaiGenerate.mock.calls[0][1]).toMatchObject({ model: 'gpt-test-mini' });
    expect(geminiGenerate).not.toHaveBeenCalled();
  });

  it('接続先が端末内なら、キーがあっても端末内で生成する', async () => {
    useSettings.setState({ aiProvider: 'local' });
    useEngine.setState({ status: 'ready' });
    await ai.generate(req, () => {});
    expect(localGenerate).toHaveBeenCalledOnce();
    expect(geminiGenerate).not.toHaveBeenCalled();
  });

  it('上限（429）で何も出していなければ、端末内のモデルで答え直す', async () => {
    useEngine.setState({ status: 'ready' });
    geminiGenerate.mockRejectedValue(new CloudError('上限', 429, true));
    await ai.generate(req, () => {});
    expect(localGenerate).toHaveBeenCalledOnce();
  });

  it('途中まで出ていたら答え直さない（重ならないように）', async () => {
    useEngine.setState({ status: 'ready' });
    geminiGenerate.mockImplementation(
      async (_r: unknown, _o: unknown, onEvent: (e: unknown) => void) => {
        onEvent({ type: 'delta', text: '途中' });
        throw new CloudError('切れた', 503, true);
      },
    );
    await expect(ai.generate(req, () => {})).rejects.toThrow('切れた');
    expect(localGenerate).not.toHaveBeenCalled();
  });

  it('キーが違うなどの答え直しても無駄なエラーはそのまま伝える', async () => {
    useEngine.setState({ status: 'ready' });
    geminiGenerate.mockRejectedValue(new CloudError('キーが違う', 400, false));
    await expect(ai.generate(req, () => {})).rejects.toThrow('キーが違う');
    expect(localGenerate).not.toHaveBeenCalled();
  });

  it('ロック中で端末内のモデルもなければ、解除をうながす', async () => {
    unlockedKey = null;
    expect(aiReadyNow()).toBe(false);
    await expect(ai.generate(req, () => {})).rejects.toThrow('ロックされています');
  });

  it('ロック中でも端末内のモデルがあれば、端末内で答える', async () => {
    unlockedKey = null;
    useEngine.setState({ status: 'ready' });
    await ai.generate(req, () => {});
    expect(localGenerate).toHaveBeenCalledOnce();
  });

  it('応答の種類ごとに決めた AI とモデルで答える（決めていない種類はいつもの AI）', async () => {
    useSettings.setState({
      cloudModels: { gemini: 'gemini-test', openai: 'gpt-big' },
      taskModels: { reaction: { provider: 'openai', model: 'gpt-cheap-mini' } },
    });
    openaiGenerate.mockResolvedValue({ status: 'done', stats: { totalMs: 1 } });
    geminiGenerate.mockResolvedValue({ status: 'done', stats: { totalMs: 1 } });
    await ai.generate(req, () => {}, undefined, 'reaction');
    expect(openaiGenerate.mock.calls[0][1]).toMatchObject({ model: 'gpt-cheap-mini' });
    await ai.generate(req, () => {}, undefined, 'assist');
    expect(geminiGenerate).toHaveBeenCalledOnce();
  });

  it('種類ごとの AI が使えないとき（端末内のモデルが無い・キーがロック中）は、いつもの AI で答える', async () => {
    useSettings.setState({ taskModels: { reaction: { provider: 'local' } } });
    geminiGenerate.mockResolvedValue({ status: 'done', stats: { totalMs: 1 } });
    await ai.generate(req, () => {}, undefined, 'reaction');
    expect(geminiGenerate).toHaveBeenCalledOnce();
    expect(localGenerate).not.toHaveBeenCalled();

    useEngine.setState({ status: 'ready' });
    await ai.generate(req, () => {}, undefined, 'reaction');
    expect(localGenerate).toHaveBeenCalledOnce();
  });
});
