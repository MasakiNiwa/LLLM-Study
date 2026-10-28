import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerateEvent, GenerateRequest } from '@/lib/llm/types';
import { CloudError } from './errors';
import {
  formatOpenRouterPrice,
  listOpenRouterModels,
  openrouterGenerate,
  parseOpenRouterModels,
  pickDefaultOpenRouterModel,
} from './openrouter';
import { sse, stream } from './testStream';

function request(over: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    settings: {
      systemPrompt: '',
      temperature: 0.7,
      topK: 64,
      topP: 0.95,
      maxOutputTokens: 512,
      enableThinking: false,
    },
    history: [],
    message: { id: 'm', role: 'user', text: '仕訳を教えて' },
    assistantId: 'a',
    ...over,
  };
}
const bodyOf = (fetchMock: ReturnType<typeof vi.fn>, i: number) =>
  JSON.parse((fetchMock.mock.calls[i] as unknown as [string, RequestInit])[1].body as string);
const opts = (model = 'google/gemini-2.5-flash') => ({
  apiKey: 'sk-or-SECRET',
  model,
  signal: new AbortController().signal,
});
const delta = (d: Record<string, unknown>) => ({ choices: [{ delta: d }] });

const RAW = {
  data: [
    {
      id: 'google/gemini-2.5-flash',
      name: 'Google: Gemini 2.5 Flash',
      context_length: 1_000_000,
      pricing: { prompt: '0.0000003', completion: '0.0000025' },
      supported_parameters: ['tools', 'reasoning', 'temperature'],
    },
    {
      id: 'openai/gpt-5-mini',
      name: 'OpenAI: GPT-5 Mini',
      pricing: { prompt: '0.00000025', completion: '0.000002' },
      supported_parameters: ['tools', 'reasoning'],
    },
    {
      id: 'meta-llama/llama-4-scout:free',
      name: 'Llama 4 Scout (free)',
      pricing: { prompt: '0', completion: '0' },
      supported_parameters: ['tools'],
    },
    {
      id: 'some/image-model',
      name: 'Image',
      architecture: { output_modalities: ['image'] },
    },
    { name: 'id のないもの' },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe('OpenRouter のモデル', () => {
  it('料金・ツール対応・考える過程の対応を読み取り、文章を出さないモデルは除く', () => {
    const models = parseOpenRouterModels(RAW);
    expect(models.map((m) => m.id)).toEqual([
      'google/gemini-2.5-flash',
      'openai/gpt-5-mini',
      'meta-llama/llama-4-scout:free',
    ]);
    expect(models[0]).toMatchObject({
      vendor: 'google',
      tools: true,
      reasoning: true,
      free: false,
      contextLength: 1_000_000,
    });
    expect(models[0].promptPrice).toBeCloseTo(0.3);
    expect(formatOpenRouterPrice(models[0])).toBe('$0.30 / $2.5');
    expect(models[2].free).toBe(true);
    expect(formatOpenRouterPrice(models[2])).toBe('無料');
  });

  it('既定は、ツールを使えて安い有料の軽いモデル（無料のモデルは選ばない）', () => {
    expect(pickDefaultOpenRouterModel(parseOpenRouterModels(RAW))).toBe('openai/gpt-5-mini');
  });

  it('キーを確かめてから一覧を取る。キーが違えば一覧は取らない', async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith('/key')
        ? new Response('{"data":{}}')
        : new Response(JSON.stringify(RAW), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const models = await listOpenRouterModels('sk-or-k');
    expect(models).toHaveLength(3);
    const [keyUrl, keyInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(keyUrl).toBe('https://openrouter.ai/api/v1/key');
    expect((keyInit.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-k');
    // 一覧の取得にはキーを付けない
    expect(
      (fetchMock.mock.calls[1] as unknown as [string, RequestInit?])[1]?.headers,
    ).toBeUndefined();

    const bad = vi.fn(async () => new Response('{"error":{"message":"No auth"}}', { status: 401 }));
    vi.stubGlobal('fetch', bad);
    await expect(listOpenRouterModels('bad')).rejects.toThrow('API キーが正しくありません');
    expect(bad).toHaveBeenCalledOnce();
  });
});

describe('openrouterGenerate', () => {
  it('OpenAI 互換の形で送り、考える過程は reasoning で頼んで thought として流す', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          stream(sse(delta({ reasoning: '考え中' }), delta({ content: '答え' }), '[DONE]')),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const events: GenerateEvent[] = [];
    const r = await openrouterGenerate(
      request({ settings: { ...request().settings, enableThinking: true } }),
      opts(),
      (e) => events.push(e),
    );
    expect(r.stats.provider).toBe('OpenRouter（google/gemini-2.5-flash）');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-or-SECRET');
    expect(headers['X-Title']).toBe('LLLM Study');
    const body = bodyOf(fetchMock, 0);
    expect(body).toMatchObject({ temperature: 0.7, reasoning: { effort: 'high' } });
    expect(body.max_tokens).toBeGreaterThanOrEqual(16384);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(events).toContainEqual({ type: 'delta', text: '考え中', channel: 'thought' });
    expect(events).toContainEqual({ type: 'delta', text: '答え' });
  });

  it('考える過程がオフなら reasoning を送らない', async () => {
    const fetchMock = vi.fn(
      async () => new Response(stream(sse(delta({ content: 'ok' }), '[DONE]')), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await openrouterGenerate(request(), opts(), () => {});
    expect(bodyOf(fetchMock, 0).reasoning).toBeUndefined();
  });

  it('ツールに対応していないモデルなら、ツールなしで送り直す', async () => {
    const replies = [
      new Response(
        JSON.stringify({ error: { message: 'No endpoints found that support tool use.' } }),
        { status: 404 },
      ),
      new Response(stream(sse(delta({ content: 'ok' }), '[DONE]')), { status: 200 }),
    ];
    const fetchMock = vi.fn(async () => replies.shift()!);
    vi.stubGlobal('fetch', fetchMock);
    await openrouterGenerate(
      request({ tools: [{ name: 'search_help', description: 'ヘルプ' }] }),
      opts('some/no-tools-model'),
      () => {},
      async () => null,
    );
    expect(bodyOf(fetchMock, 0).tools).toHaveLength(1);
    expect(bodyOf(fetchMock, 1).tools).toBeUndefined();
  });

  it('クレジット不足（402）は待っても直らない、回数の上限（429）は答え直せるエラー', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response('{"error":{"message":"Insufficient credits"}}', { status: 402 }),
      ),
    );
    const e1 = await openrouterGenerate(request(), opts(), () => {}).catch((e) => e);
    expect(e1).toBeInstanceOf(CloudError);
    expect(e1.message).toContain('クレジットが足りません');
    expect(e1.retryable).toBe(false);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":{"message":"Rate limit"}}', { status: 429 })),
    );
    const e2 = await openrouterGenerate(request(), opts(), () => {}).catch((e) => e);
    expect(e2.retryable).toBe(true);
  });

  it('ストリームの途中で届いたエラーも知らせる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            stream(sse(delta({ content: '途中' }), { error: { code: 502, message: 'down' } })),
            { status: 200 },
          ),
      ),
    );
    await expect(openrouterGenerate(request(), opts(), () => {})).rejects.toThrow('応答できません');
  });
});
