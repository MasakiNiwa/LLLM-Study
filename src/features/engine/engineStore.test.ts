import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/llm/client', () => ({
  llm: { loadModel: vi.fn(), unloadModel: vi.fn(async () => {}), terminate: vi.fn() },
}));

import { llm } from '@/lib/llm/client';
import { useAiBusy } from '@/features/ai/aiBusy';
import { useEngine } from './engineStore';

describe('engineStore', () => {
  it('AI の生成中はモデルの読み込み・解放をしない', async () => {
    useAiBusy.setState({ task: 'chat' });
    useEngine.setState({ status: 'ready', webgpu: true });
    expect(await useEngine.getState().load({ kind: 'stored', name: 'm.litertlm' })).toBe(false);
    await useEngine.getState().unload();
    expect(llm.unloadModel).not.toHaveBeenCalled();
    expect(useEngine.getState().status).toBe('ready');

    useAiBusy.setState({ task: null });
    await useEngine.getState().unload();
    expect(llm.unloadModel).toHaveBeenCalled();
    expect(useEngine.getState().status).toBe('empty');
  });
});
