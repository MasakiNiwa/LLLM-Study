import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenerateEvent, GenerateRequest } from '@/lib/llm/types';
import { anthropicGenerate, listAnthropicModels, pickDefaultAnthropicModel } from './anthropic';
import { CloudError } from './errors';
import { sse, stream } from './testStream';

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
const opts = (model = 'claude-haiku-5-5') => ({
  apiKey: 'sk-ant-SECRET',
  model,
  signal: new AbortController().signal,
});
const textReply = (...texts: string[]) =>
  sse(
    { type: 'message_start', message: { usage: { input_tokens: 40 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    ...texts.map((text) => ({
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text },
    })),
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 6 } },
    { type: 'message_stop' },
  );

afterEach(() => vi.unstubAllGlobals());

describe('anthropicGenerate', () => {
  it('キーは x-api-key で送り、ブラウザから呼ぶための印を付ける。temperature は送らない', async () => {
    const fetchMock = vi.fn(
      async () => new Response(stream(textReply('借方は', '仕入です')), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const events: GenerateEvent[] = [];
    const r = await anthropicGenerate(request(), opts(), (e) => events.push(e));
    expect(r).toMatchObject({
      status: 'done',
      stats: { provider: 'Claude（claude-haiku-5-5）', prefillTokens: 40, decodeTokens: 6 },
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-SECRET');
    expect(headers['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(headers['anthropic-version']).toBeTruthy();
    expect(url).not.toContain('SECRET');
    const body = bodyOf(fetchMock, 0);
    expect(body).toMatchObject({ stream: true, system: 'あなたは先生です' });
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual([
      'user',
      'assistant',
      'user',
    ]);
    expect(body.temperature).toBeUndefined();
    expect(body.top_k).toBeUndefined();
    expect(body.thinking).toBeUndefined();
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body.max_tokens).toBeGreaterThanOrEqual(4096);
    expect(events.filter((e) => e.type === 'delta').map((e) => 'text' in e && e.text)).toEqual([
      '借方は',
      '仕入です',
    ]);
  });

  it('考える過程がオンなら要約を表示して、考えた内容は thought として流す', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          stream(
            sse(
              {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'thinking', thinking: '', signature: '' },
              },
              {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'thinking_delta', thinking: '勘定科目を考える' },
              },
              { type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } },
              {
                type: 'content_block_delta',
                index: 1,
                delta: { type: 'text_delta', text: '答え' },
              },
              { type: 'message_delta', delta: { stop_reason: 'end_turn' } },
            ),
          ),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    const events: GenerateEvent[] = [];
    await anthropicGenerate(
      request({ settings: { ...request().settings, enableThinking: true } }),
      opts(),
      (e) => events.push(e),
    );
    const body = bodyOf(fetchMock, 0);
    expect(body.thinking).toEqual({ type: 'adaptive', display: 'summarized' });
    expect(body.output_config).toEqual({ effort: 'high' });
    expect(events).toContainEqual({ type: 'delta', text: '勘定科目を考える', channel: 'thought' });
    expect(events).toContainEqual({ type: 'delta', text: '答え' });
  });

  it('ツールを実行し、考える過程（署名つき）とツールの呼び出しをそのまま履歴に戻す', async () => {
    const replies = [
      sse(
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'thinking', thinking: '', signature: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'thinking_delta', thinking: 'ヘルプを探す' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'signature_delta', signature: 'SIG' },
        },
        {
          type: 'content_block_start',
          index: 1,
          content_block: { type: 'tool_use', id: 'toolu_1', name: 'search_help', input: {} },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '{"query":' },
        },
        {
          type: 'content_block_delta',
          index: 1,
          delta: { type: 'input_json_delta', partial_json: '"バックアップ"}' },
        },
        { type: 'content_block_stop', index: 1 },
        { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
      ),
      textReply('設定から書き出せます'),
    ];
    const fetchMock = vi.fn(
      async () => new Response(stream(replies.shift() ?? ''), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onToolCall = vi.fn(async () => ({ found: 1 }));
    const events: GenerateEvent[] = [];
    await anthropicGenerate(
      request({ tools: [{ name: 'search_help', description: 'ヘルプを探す' }] }),
      opts(),
      (e) => events.push(e),
      onToolCall,
    );
    expect(onToolCall).toHaveBeenCalledWith({
      name: 'search_help',
      arguments: { query: 'バックアップ' },
    });
    const first = bodyOf(fetchMock, 0);
    // 引数のないツールにも空の input_schema を付ける
    expect(first.tools[0]).toEqual({
      name: 'search_help',
      description: 'ヘルプを探す',
      input_schema: { type: 'object', properties: {} },
    });
    const second = bodyOf(fetchMock, 1);
    const [assistant, results] = second.messages.slice(-2);
    expect(assistant).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'ヘルプを探す', signature: 'SIG' },
        { type: 'tool_use', id: 'toolu_1', name: 'search_help', input: { query: 'バックアップ' } },
      ],
    });
    expect(results).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{"found":1}' }],
    });
    expect(events).toContainEqual({ type: 'tool-result', name: 'search_help', ok: true });
  });

  it('400 なら最小限の設定で送り直し、そのモデルでは次からも最小限で送る', async () => {
    const replies = [
      new Response(JSON.stringify({ error: { type: 'invalid_request_error', message: 'x' } }), {
        status: 400,
      }),
      new Response(stream(textReply('ok')), { status: 200 }),
      new Response(stream(textReply('ok')), { status: 200 }),
    ];
    const fetchMock = vi.fn(async () => replies.shift()!);
    vi.stubGlobal('fetch', fetchMock);
    await anthropicGenerate(request(), opts('claude-old-1'), () => {});
    await anthropicGenerate(request(), opts('claude-old-1'), () => {});
    expect(bodyOf(fetchMock, 0).output_config).toBeDefined();
    expect(bodyOf(fetchMock, 1).output_config).toBeUndefined();
    expect(bodyOf(fetchMock, 2).output_config).toBeUndefined();
  });

  it('残高不足は待っても直らないエラー、混雑は答え直せるエラーにする', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { type: 'invalid_request_error', message: 'Your credit balance is too low' },
            }),
            { status: 400 },
          ),
      ),
    );
    const e1 = await anthropicGenerate(request(), opts('claude-x'), () => {}).catch((e) => e);
    expect(e1).toBeInstanceOf(CloudError);
    expect(e1.message).toContain('クレジットの残高');
    expect(e1.retryable).toBe(false);

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { type: 'overloaded_error', message: '' } }), {
            status: 529,
          }),
      ),
    );
    const e2 = await anthropicGenerate(request(), opts(), () => {}).catch((e) => e);
    expect(e2.retryable).toBe(true);
  });
});

describe('listAnthropicModels', () => {
  it('キーが違えば分かる文で知らせ、既定は新しい Haiku にする', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":{"type":"authentication_error"}}', { status: 401 })),
    );
    await expect(listAnthropicModels('bad')).rejects.toThrow('API キーが正しくありません');

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              data: [
                { id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' },
                { id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5' },
                { id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5' },
                { id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5' },
              ],
            }),
          ),
      ),
    );
    const models = await listAnthropicModels('k');
    expect(models[0]).toEqual({ id: 'claude-opus-5-5', displayName: 'Claude Opus 5.5' });
    expect(pickDefaultAnthropicModel(models)).toBe('claude-haiku-5-5');
  });
});
