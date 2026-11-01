import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/llm/client', () => ({
  llm: { cancel: vi.fn(), resetConversation: vi.fn(async () => {}), generate: vi.fn() },
}));

import { db } from '@/lib/db/db';
import { exportBackup, restoreBackup } from '@/lib/db/backup';
import { llm } from '@/lib/llm/client';
import { useAiBusy } from '@/features/ai/aiBusy';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings } from '@/features/settings/settingsStore';
import { useChat } from './chatStore';

// node には requestAnimationFrame がないので、すぐ呼ぶ形で用意する
globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) =>
  setTimeout(() => cb(0), 0) as unknown as number) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame ??= ((id: number) =>
  clearTimeout(id)) as typeof cancelAnimationFrame;

const records = [
  { id: 'u', role: 'user' as const, text: 'hello', createdAt: 1 },
  { id: 'a', role: 'assistant' as const, text: 'valuable previous answer', createdAt: 2 },
];

beforeEach(async () => {
  await db.delete();
  await db.open();
  useChat.setState({ messages: [], threads: [], threadId: null, isGenerating: false });
  useAiBusy.setState({ task: null });
  useSettings.setState({ shareStudyState: false, useTools: false });
  vi.mocked(llm.generate).mockReset();
});

describe('chatStore', () => {
  it('バックアップの復元のあと、復元したチャット履歴を表示し直す（DB は消さない）', async () => {
    await db.chat.add({ id: 'm1', role: 'user', text: 'こんにちは', createdAt: 1 });
    const backup = JSON.stringify(await exportBackup());
    await db.chat.clear();
    await restoreBackup(backup);
    await useChat.getState().reload();
    expect(await db.chat.count()).toBe(1);
    expect(useChat.getState().messages.map((m) => m.text)).toEqual(['こんにちは']);
  });

  it('モデルがないときの「もう一度生成」は、元の応答を消さない', async () => {
    await db.chat.bulkPut(records);
    useChat.setState({ messages: records });
    useEngine.setState({ status: 'empty' });
    await useChat.getState().regenerate();
    expect(await db.chat.get('a')).toBeDefined();
    expect(useChat.getState().messages.map((m) => m.id)).toEqual(['u', 'a']);
  });

  it('作り直しを止めたら元の応答に戻し、できたら置き換える', async () => {
    await db.chat.bulkPut(records);
    useChat.setState({ messages: records });
    useEngine.setState({ status: 'ready' });
    vi.mocked(llm.generate).mockResolvedValueOnce({ status: 'cancelled' } as never);
    await useChat.getState().regenerate();
    expect(useChat.getState().messages.map((m) => m.text)).toEqual([
      'hello',
      'valuable previous answer',
    ]);
    expect(await db.chat.count()).toBe(2);

    vi.mocked(llm.generate).mockImplementationOnce(async (_req, onEvent) => {
      onEvent({ type: 'delta', text: 'new answer' } as never);
      return { status: 'done' } as never;
    });
    await useChat.getState().regenerate();
    expect(useChat.getState().messages.map((m) => m.text)).toEqual(['hello', 'new answer']);
    expect(await db.chat.get('a')).toBeUndefined();
    expect(await db.chat.count()).toBe(2);
  });

  it('ほかの AI の処理中は送信を受け付けず、false を返す（入力を残せる）', () => {
    useEngine.setState({ status: 'ready' });
    useAiBusy.setState({ task: 'assist' });
    expect(useChat.getState().send('do not lose this draft')).toBe(false);
    expect(useChat.getState().messages).toEqual([]);
  });

  it('使い方モードでは、質問に関係するヘルプの抜粋を添えて送る', async () => {
    useEngine.setState({ status: 'ready' });
    useChat.setState({ helpMode: true });
    vi.mocked(llm.generate).mockImplementationOnce(async (_req, onEvent) => {
      onEvent({ type: 'delta', text: '右上のタイマーから設定できます' } as never);
      return { status: 'done' } as never;
    });
    expect(useChat.getState().send('タイマーの設定はどこ？')).toBe(true);
    await vi.waitFor(() => expect(vi.mocked(llm.generate)).toHaveBeenCalled());
    await vi.waitFor(() => expect(useChat.getState().isGenerating).toBe(false));
    const req = vi.mocked(llm.generate).mock.calls[0][0];
    expect(req.message.text).toContain('<app_help>');
    expect(req.message.text).toContain('時間を測る');
    expect(req.message.text).toContain('タイマーの設定はどこ？');
    useChat.setState({ helpMode: false });
  });

  it('入力欄の「考える」で、送信ごとに思考モードを切り替える', async () => {
    useEngine.setState({ status: 'ready' });
    useSettings.setState({ enableThinking: false });
    useChat.setState({ thinking: true });
    vi.mocked(llm.generate).mockResolvedValueOnce({ status: 'done' } as never);
    expect(useChat.getState().send('考えて答えて')).toBe(true);
    await vi.waitFor(() => expect(vi.mocked(llm.generate)).toHaveBeenCalled());
    expect(vi.mocked(llm.generate).mock.calls[0][0].settings.enableThinking).toBe(true);
    await vi.waitFor(() => expect(useChat.getState().isGenerating).toBe(false));
    useChat.setState({ thinking: null });
  });

  it('最初の送信でスレッドを作り、新しいチャット・履歴から開くで切り替える', async () => {
    useEngine.setState({ status: 'ready' });
    const answer = (text: string) =>
      vi.mocked(llm.generate).mockImplementationOnce(async (_req, onEvent) => {
        onEvent({ type: 'delta', text } as never);
        return { status: 'done', stats: { totalMs: 1 } } as never;
      });
    answer('仕訳はこうです');
    expect(useChat.getState().send('売掛金の仕訳を教えて')).toBe(true);
    await vi.waitFor(() => expect(useChat.getState().messages).toHaveLength(2));
    await vi.waitFor(() => expect(useChat.getState().isGenerating).toBe(false));
    const first = useChat.getState().threadId!;
    expect(useChat.getState().threads).toMatchObject([
      { id: first, title: '売掛金の仕訳を教えて' },
    ]);

    useChat.getState().newChat();
    await vi.waitFor(() => expect(useChat.getState().threadId).toBeNull());
    expect(useChat.getState().messages).toEqual([]);
    answer('違いはこうです');
    useChat.getState().send('交際費と会議費の違いは？');
    await vi.waitFor(() => expect(useChat.getState().messages).toHaveLength(2));
    await vi.waitFor(() => expect(useChat.getState().isGenerating).toBe(false));
    expect(useChat.getState().threads.map((t) => t.title)).toEqual([
      '交際費と会議費の違いは？',
      '売掛金の仕訳を教えて',
    ]);

    await useChat.getState().openThread(first);
    expect(useChat.getState().messages.map((m) => m.text)).toEqual([
      '売掛金の仕訳を教えて',
      '仕訳はこうです',
    ]);
    // 前のスレッドを開いたときは、モデル側の会話（KV キャッシュ）も作り直す
    expect(llm.resetConversation).toHaveBeenCalled();

    await useChat.getState().deleteThread(first);
    expect(useChat.getState().threadId).toBeNull();
    expect(await db.chat.where('threadId').equals(first).count()).toBe(0);
    expect(useChat.getState().threads).toHaveLength(1);
  });

  it('自分の発言を直して送り直すと、その発言から後ろを作り直す', async () => {
    const thread = { id: 't1', title: 'hello', createdAt: 1, updatedAt: 2 };
    const recs = records.map((r) => ({ ...r, threadId: 't1' }));
    await db.threads.add(thread);
    await db.chat.bulkPut(recs);
    useChat.setState({ threads: [thread], threadId: 't1', messages: recs });
    useEngine.setState({ status: 'ready' });
    vi.mocked(llm.generate).mockImplementationOnce(async (_req, onEvent) => {
      onEvent({ type: 'delta', text: 'こんにちは！' } as never);
      return { status: 'done', stats: { totalMs: 1 } } as never;
    });
    expect(useChat.getState().editAndResend('u', 'こんにちは')).toBe(true);
    await vi.waitFor(() => expect(useChat.getState().isGenerating).toBe(false));
    await vi.waitFor(() =>
      expect(useChat.getState().messages.map((m) => m.text)).toEqual([
        'こんにちは',
        'こんにちは！',
      ]),
    );
    expect(await db.chat.get('u')).toBeUndefined();
    expect(await db.chat.get('a')).toBeUndefined();
    expect(await db.chat.where('threadId').equals('t1').count()).toBe(2);
    // 最初の発言を直したので、スレッドの名前も変わる
    expect(useChat.getState().threads[0].title).toBe('こんにちは');
  });
});
