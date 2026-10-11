import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/llm/client', () => ({
  llm: { cancel: vi.fn(), resetConversation: vi.fn(async () => {}), generate: vi.fn() },
}));

import { db } from '@/lib/db/db';
import { exportBackup, restoreBackup } from '@/lib/db/backup';
import { useChat } from './chatStore';

beforeEach(async () => {
  await db.delete();
  await db.open();
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
});
