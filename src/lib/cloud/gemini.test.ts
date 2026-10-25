import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerateEvent, GenerateRequest } from '@/lib/llm/types';
import { CloudError, geminiGenerate, listGeminiModels, pickDefaultGeminiModel } from './gemini';
import { readSse } from './sse';

function stream(text: string): ReadableStream<Uint8Array> {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream({
    start(c) {
      // わざと途中で切って届ける
      c.enqueue(bytes.slice(0, 7));
      c.enqueue(bytes.slice(7));
      c.close();
    },
  });
}

const sse = (...chunks: unknown[]) =>
  chunks.map((c) => `data: ${JSON.stringify(c)}\r\n\r\n`).join('');

function request(over: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    settings: {
      systemPrompt: 'あなたは先生です',
      temperature: 0.7,
      topK: 40,
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

afterEach(() => vi.unstubAllGlobals());

describe('readSse', () => {
  it('分割されて届いても 1 件ずつ取り出す', async () => {
    const out: string[] = [];
    for await (const d of readSse(stream('data: {"a":1}\n\n: comment\n\ndata: {"b":2}\n\n')))
      out.push(d);
    expect(out).toEqual(['{"a":1}', '{"b":2}']);
  });
});

describe('geminiGenerate', () => {
  it('キーはヘッダーで送り、履歴・システムプロンプト・考える設定を Gemini の形にする', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          stream(
            sse(
              { candidates: [{ content: { parts: [{ text: '借方は' }] } }] },
              {
                candidates: [{ content: { parts: [{ text: '仕入です' }] }, finishReason: 'STOP' }],
                usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 6 },
              },
            ),
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const events: GenerateEvent[] = [];
    const r = await geminiGenerate(
      request(),
      { apiKey: 'SECRET-KEY', model: 'gemini-2.5-flash', signal: new AbortController().signal },
      (e) => events.push(e),
    );
    expect(r.status).toBe('done');
    expect(r.stats).toMatchObject({
      provider: 'Gemini（gemini-2.5-flash）',
      prefillTokens: 20,
      decodeTokens: 6,
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/models/gemini-2.5-flash:streamGenerateContent?alt=sse');
    expect(url).not.toContain('SECRET-KEY');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('SECRET-KEY');
    const body = JSON.parse(init.body as string);
    expect(body.systemInstruction.parts[0].text).toBe('あなたは先生です');
    expect(body.contents.map((c: { role: string }) => c.role)).toEqual(['user', 'model', 'user']);
    // 2.5 Flash は考える過程を止められる。topK・topP（端末内のモデル向け）は送らない
    expect(body.generationConfig.thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(body.generationConfig.topK).toBeUndefined();
    expect(body.generationConfig.topP).toBeUndefined();
    expect(body.generationConfig.maxOutputTokens).toBe(512);
    expect(events.filter((e) => e.type === 'delta').map((e) => 'text' in e && e.text)).toEqual([
      '借方は',
      '仕入です',
    ]);
  });

  it('ツールを呼んだら実行して、結果を渡して続きを生成する', async () => {
    const replies = [
      sse({
        candidates: [
          {
            content: {
              parts: [
                {
                  functionCall: { name: 'search_help', args: { query: 'バックアップ' } },
                  thoughtSignature: 'sig',
                },
              ],
            },
          },
        ],
      }),
      sse({
        candidates: [
          { content: { parts: [{ text: '設定から書き出せます' }] }, finishReason: 'STOP' },
        ],
      }),
    ];
    const fetchMock = vi.fn(
      async () => new Response(stream(replies.shift() ?? ''), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onToolCall = vi.fn(async () => ({ found: 'バックアップの手順' }));
    const events: GenerateEvent[] = [];
    await geminiGenerate(
      request({
        tools: [
          {
            name: 'search_help',
            description: 'ヘルプを探す',
            parameters: { type: 'object', properties: { query: { type: 'string' } } },
          },
          {
            name: 'get_stats',
            description: '統計',
            parameters: { type: 'object', properties: {} },
          },
        ],
      }),
      { apiKey: 'k', model: 'm', signal: new AbortController().signal },
      (e) => events.push(e),
      onToolCall,
    );
    expect(onToolCall).toHaveBeenCalledWith({
      name: 'search_help',
      arguments: { query: 'バックアップ' },
    });
    const first = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(first.tools[0].functionDeclarations[0].parameters.type).toBe('OBJECT');
    // 引数のないツールには parameters を付けない
    expect(first.tools[0].functionDeclarations[1].parameters).toBeUndefined();
    const second = JSON.parse(
      (fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string,
    );
    // モデルの関数呼び出し（署名つき）と、その結果を履歴に足して送り直す
    expect(second.contents.at(-2).parts[0].thoughtSignature).toBe('sig');
    expect(second.contents.at(-1).parts[0].functionResponse).toEqual({
      name: 'search_help',
      response: { found: 'バックアップの手順' },
    });
    expect(events.map((e) => e.type)).toEqual(['tool-call', 'tool-result', 'first-token', 'delta']);
  });

  it('考える過程は thought のチャンネルで出す', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          stream(
            sse({
              candidates: [
                {
                  content: { parts: [{ text: '考え中', thought: true }, { text: '答え' }] },
                  finishReason: 'STOP',
                },
              ],
            }),
          ),
          { status: 200 },
        ),
    );
    const events: GenerateEvent[] = [];
    await geminiGenerate(
      request({ settings: { ...request().settings, enableThinking: true } }),
      { apiKey: 'k', model: 'm', signal: new AbortController().signal },
      (e) => events.push(e),
    );
    expect(events.filter((e) => e.type === 'delta')).toEqual([
      { type: 'delta', text: '考え中', channel: 'thought' },
      { type: 'delta', text: '答え' },
    ]);
  });

  it('考える過程を止められないモデルには止める設定を送らず、出力の上限に余裕を持たせる', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          stream(
            sse({ candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }] }),
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    await geminiGenerate(
      request(),
      { apiKey: 'k', model: 'gemini-3-flash', signal: new AbortController().signal },
      () => {},
    );
    const body = JSON.parse(
      (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string,
    );
    expect(body.generationConfig.thinkingConfig).toBeUndefined();
    expect(body.generationConfig.maxOutputTokens).toBeGreaterThanOrEqual(4096);
  });

  it('設定を受け付けない（400）なら、最小限の設定で送り直し、次からも最小限で送る', async () => {
    const replies = [
      new Response(
        JSON.stringify({ error: { message: 'Request contains an invalid argument.' } }),
        { status: 400 },
      ),
      new Response(
        stream(
          sse({ candidates: [{ content: { parts: [{ text: '答え' }] }, finishReason: 'STOP' }] }),
        ),
        { status: 200 },
      ),
      new Response(
        stream(
          sse({ candidates: [{ content: { parts: [{ text: '答え' }] }, finishReason: 'STOP' }] }),
        ),
        { status: 200 },
      ),
    ];
    const fetchMock = vi.fn(async () => replies.shift() as Response);
    vi.stubGlobal('fetch', fetchMock);
    const thinking = request({ settings: { ...request().settings, enableThinking: true } });
    const opts = { apiKey: 'k', model: 'gemini-new', signal: new AbortController().signal };
    const r = await geminiGenerate(thinking, opts, () => {});
    expect(r.status).toBe('done');
    const bodyOf = (i: number) =>
      JSON.parse((fetchMock.mock.calls[i] as unknown as [string, RequestInit])[1].body as string);
    expect(bodyOf(0).generationConfig.thinkingConfig).toEqual({ includeThoughts: true });
    expect(bodyOf(1).generationConfig.thinkingConfig).toBeUndefined();
    expect(bodyOf(1).generationConfig.temperature).toBeUndefined();
    await geminiGenerate(thinking, opts, () => {});
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(bodyOf(2).generationConfig.thinkingConfig).toBeUndefined();
  });

  it('送り直しても受け付けられなければ、モデルを変える案内をつけて伝える', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({ error: { message: 'Request contains an invalid argument.' } }),
          { status: 400 },
        ),
    );
    await expect(
      geminiGenerate(
        request(),
        { apiKey: 'k', model: 'gemini-broken', signal: new AbortController().signal },
        () => {},
      ),
    ).rejects.toThrow('別のモデルを選ぶ');
  });

  it('上限に達したら、待てば使えるエラーにする', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(JSON.stringify({ error: { message: 'Resource exhausted' } }), { status: 429 }),
    );
    const p = geminiGenerate(
      request(),
      { apiKey: 'k', model: 'm', signal: new AbortController().signal },
      () => {},
    );
    await expect(p).rejects.toBeInstanceOf(CloudError);
    await expect(p).rejects.toMatchObject({ status: 429, retryable: true });
  });

  it('キーが違うときは分かる言葉にする', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({ error: { message: 'API key not valid. Please pass a valid API key.' } }),
          { status: 400 },
        ),
    );
    await expect(listGeminiModels('bad')).rejects.toThrow('API キーが正しくありません');
  });

  it('止めたら cancelled を返す', async () => {
    const ctrl = new AbortController();
    vi.stubGlobal('fetch', async () => {
      ctrl.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    const r = await geminiGenerate(
      request(),
      { apiKey: 'k', model: 'm', signal: ctrl.signal },
      () => {},
    );
    expect(r.status).toBe('cancelled');
  });
});

describe('モデルの一覧', () => {
  it('文章の生成に使えるモデルだけを出し、既定は安定版の新しい Flash', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response(
          JSON.stringify({
            models: [
              { name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-3-flash', supportedGenerationMethods: ['generateContent'] },
              {
                name: 'models/gemini-3-flash-preview',
                supportedGenerationMethods: ['generateContent'],
              },
              { name: 'models/gemini-2.5-pro', supportedGenerationMethods: ['generateContent'] },
              { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] },
              {
                name: 'models/gemini-2.5-flash-image',
                supportedGenerationMethods: ['generateContent'],
              },
            ],
          }),
          { status: 200 },
        ),
    );
    const models = await listGeminiModels('k');
    expect(models.map((m) => m.id)).toEqual([
      'gemini-2.5-flash',
      'gemini-3-flash',
      'gemini-3-flash-preview',
      'gemini-2.5-pro',
    ]);
    expect(pickDefaultGeminiModel(models)).toBe('gemini-3-flash');
  });
});
