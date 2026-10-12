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
  useChat.setState({ messages: [], isGenerating: false });
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
});
