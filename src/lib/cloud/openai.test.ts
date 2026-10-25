import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerateEvent, GenerateRequest } from '@/lib/llm/types';
import { CloudError } from './errors';
import { listOpenAiModels, openaiGenerate, pickDefaultOpenAiModel } from './openai';

function stream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(c) {
      c.enqueue(bytes.slice(0, 11));
      c.enqueue(bytes.slice(11));
      c.close();
    },
  });
}
const sse = (...chunks: unknown[]) =>
  chunks.map((c) => `data: ${typeof c === 'string' ? c : JSON.stringify(c)}\n\n`).join('');
const delta = (content: string) => ({ choices: [{ delta: { content } }] });

function request(over: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    settings: {
      systemPrompt: 'あなたは先生です',
      temperature: 0.7,
      topK: 64,
      topP: 0.95,
      maxOutputTokens: 512,
      enableThinking: false,
    },
    history: [
      { id: 'h1', role: 'user', text: 'こんにちは' },
      { id: 'h2', role: 'assistant', text: 'こんにちは！' },
    ],
    message: { id: 'm', role: 'user', text: '仕訳を教えて' },
    assistantId: 'a',
    ...over,
  };
}
const bodyOf = (fetchMock: ReturnType<typeof vi.fn>, i: number) =>
  JSON.parse((fetchMock.mock.calls[i] as unknown as [string, RequestInit])[1].body as string);

afterEach(() => vi.unstubAllGlobals());

describe('openaiGenerate', () => {
  it('キーは Authorization ヘッダーで送り、システム・履歴を Chat Completions の形にする', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          stream(
            sse(
              delta('借方は'),
              delta('仕入です'),
              { choices: [{ delta: {}, finish_reason: 'stop' }] },
              {
                choices: [],
                usage: { prompt_tokens: 30, completion_tokens: 5 },
              },
              '[DONE]',
            ),
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const events: GenerateEvent[] = [];
    const r = await openaiGenerate(
      request(),
      { apiKey: 'sk-SECRET', model: 'gpt-4.1-mini', signal: new AbortController().signal },
      (e) => events.push(e),
    );
    expect(r).toMatchObject({
      status: 'done',
      stats: { provider: 'OpenAI（gpt-4.1-mini）', prefillTokens: 30, decodeTokens: 5 },
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-SECRET');
    const body = bodyOf(fetchMock, 0);
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual([
      'system',
      'user',
      'assistant',
      'user',
    ]);
    expect(body).toMatchObject({ stream: true, temperature: 0.7, max_completion_tokens: 512 });
    // 端末内のモデル向けの値は送らない
    expect(body.top_k).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
    expect(events.filter((e) => e.type === 'delta').map((e) => 'text' in e && e.text)).toEqual([
      '借方は',
      '仕入です',
    ]);
  });

  it('推論モデルには temperature を送らず、考える深さと出力の上限を決める', async () => {
    const fetchMock = vi.fn(
      async () => new Response(stream(sse(delta('ok'), '[DONE]')), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await openaiGenerate(
      request(),
      { apiKey: 'k', model: 'gpt-5-mini', signal: new AbortController().signal },
      () => {},
    );
    const body = bodyOf(fetchMock, 0);
    expect(body.temperature).toBeUndefined();
    expect(body.reasoning_effort).toBe('low');
    expect(body.max_completion_tokens).toBeGreaterThanOrEqual(4096);
  });

  it('少しずつ届くツールの呼び出しをつなげて実行し、結果を渡して続きを生成する', async () => {
    const replies = [
      sse(
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  { index: 0, id: 'call_1', function: { name: 'search_help', arguments: '{"que' } },
                ],
              },
            },
          ],
        },
        {
          choices: [
            {
              delta: { tool_calls: [{ index: 0, function: { arguments: 'ry":"バックアップ"}' } }] },
            },
          ],
        },
        { choices: [{ delta: {}, finish_reason: 'tool_calls' }] },
        '[DONE]',
      ),
      sse(delta('設定から書き出せます'), '[DONE]'),
    ];
    const fetchMock = vi.fn(
      async () => new Response(stream(replies.shift() ?? ''), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onToolCall = vi.fn(async () => ({ found: '手順' }));
    const events: GenerateEvent[] = [];
    await openaiGenerate(
      request({
        tools: [
          {
            name: 'search_help',
            description: 'ヘルプを探す',
            parameters: { type: 'object', properties: { query: { type: 'string' } } },
          },
          { name: 'get_stats', description: '統計' },
        ],
      }),
      { apiKey: 'k', model: 'gpt-4.1-mini', signal: new AbortController().signal },
      (e) => events.push(e),
      onToolCall,
    );
    expect(onToolCall).toHaveBeenCalledWith({
      name: 'search_help',
      arguments: { query: 'バックアップ' },
    });
    const first = bodyOf(fetchMock, 0);
    expect(first.tools[1].function.parameters).toEqual({ type: 'object', properties: {} });
    const second = bodyOf(fetchMock, 1);
    expect(second.messages.at(-2)).toMatchObject({
      role: 'assistant',
      tool_calls: [{ id: 'call_1', function: { name: 'search_help' } }],
    });
    expect(second.messages.at(-1)).toEqual({
      role: 'tool',
      tool_call_id: 'call_1',
      content: '{"found":"手順"}',
    });
    expect(events.map((e) => e.type)).toEqual(['tool-call', 'tool-result', 'first-token', 'delta']);
  });

  it('設定を受け付けない（400）なら最小限の設定で送り直す', async () => {
    const replies = [
      new Response(JSON.stringify({ error: { message: "Unsupported parameter: 'temperature'" } }), {
        status: 400,
      }),
      new Response(stream(sse(delta('ok'), '[DONE]')), { status: 200 }),
    ];
    const fetchMock = vi.fn(async () => replies.shift() as Response);
    vi.stubGlobal('fetch', fetchMock);
    await openaiGenerate(
      request(),
      { apiKey: 'k', model: 'gpt-new', signal: new AbortController().signal },
      () => {},
    );
    expect(bodyOf(fetchMock, 0).temperature).toBe(0.7);
    expect(bodyOf(fetchMock, 1).temperature).toBeUndefined();
  });

  it('残高不足は待っても直らないエラー、短時間の使いすぎは待てば使えるエラーにする', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            error: { message: 'You exceeded your current quota', code: 'insufficient_quota' },
          }),
          { status: 429 },
        ),
    );
    const p = openaiGenerate(
      request(),
      { apiKey: 'k', model: 'm', signal: new AbortController().signal },
      () => {},
    );
    await expect(p).rejects.toMatchObject({ status: 429, retryable: false });
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({ error: { message: 'Rate limit reached', code: 'rate_limit_exceeded' } }),
          { status: 429 },
        ),
    );
    await expect(
      openaiGenerate(
        request(),
        { apiKey: 'k', model: 'm', signal: new AbortController().signal },
        () => {},
      ),
    ).rejects.toMatchObject({ retryable: true });
  });

  it('キーが違うときは分かる言葉にする', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ error: { message: 'Incorrect API key provided' } }), {
          status: 401,
        }),
    );
    await expect(listOpenAiModels('bad')).rejects.toBeInstanceOf(CloudError);
    await expect(listOpenAiModels('bad')).rejects.toThrow('API キーが正しくありません');
  });
});

describe('OpenAI のモデルの一覧', () => {
  it('会話に使えるモデルだけを出し、既定は日付つきでない新しい mini', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            data: [
              'gpt-4.1-mini',
              'gpt-5-mini',
              'gpt-5-mini-2025-08-07',
              'gpt-5',
              'gpt-4o-audio-preview',
              'text-embedding-3-small',
              'dall-e-3',
              'gpt-4o-realtime-preview',
              'whisper-1',
              'o4-mini',
            ].map((id) => ({ id })),
          }),
          { status: 200 },
        ),
    );
    const models = await listOpenAiModels('k');
    expect(models.map((m) => m.id)).toEqual([
      'o4-mini',
      'gpt-5-mini-2025-08-07',
      'gpt-5-mini',
      'gpt-5',
      'gpt-4.1-mini',
    ]);
    expect(pickDefaultOpenAiModel(models)).toBe('gpt-5-mini');
    expect(
      pickDefaultOpenAiModel([
        { id: 'gpt-5-mini', displayName: '' },
        { id: 'gpt-5.5-mini', displayName: '' },
      ]),
    ).toBe('gpt-5.5-mini');
  });
});
