import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/llm/client', () => ({
  llm: { cancel: vi.fn(), resetConversation: vi.fn(async () => {}), generate: vi.fn() },
}));

import { llm } from '@/lib/llm/client';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings } from '@/features/settings/settingsStore';
import { useAiBusy } from './aiBusy';
import { oneshotTemperature, runOneshotParsed } from './oneshot';

globalThis.requestAnimationFrame ??= ((cb: FrameRequestCallback) =>
  setTimeout(() => cb(0), 0) as unknown as number) as typeof requestAnimationFrame;
globalThis.cancelAnimationFrame ??= ((id: number) =>
  clearTimeout(id)) as typeof cancelAnimationFrame;

describe('oneshotTemperature', () => {
  const s = { temperature: 1, taskTemperature: true };
  it('タスクごとに温度を変え、作り直すたびに少し上げる', () => {
    expect(oneshotTemperature('judge', 0, s)).toBeCloseTo(0.2);
    expect(oneshotTemperature('structured', 0, s)).toBeCloseTo(0.3);
    expect(oneshotTemperature('varied', 0, s)).toBeCloseTo(0.7);
    expect(oneshotTemperature('structured', 1, s)).toBeCloseTo(0.45);
    expect(oneshotTemperature('varied', 5, s)).toBe(1);
    expect(oneshotTemperature('free', 0, s)).toBe(1);
  });
  it('設定でオフにすると、いつも設定の温度', () => {
    expect(oneshotTemperature('judge', 0, { temperature: 0.8, taskTemperature: false })).toBe(0.8);
  });
});

describe('runOneshotParsed', () => {
  beforeEach(() => {
    useEngine.setState({ status: 'ready' });
    useAiBusy.setState({ task: null });
    useSettings.setState({ temperature: 1, taskTemperature: true, keepChatContext: true });
    vi.mocked(llm.generate).mockReset();
  });

  it('読み取れなければ、温度を上げて作り直す。チャットの文脈を残すよう頼む', async () => {
    const outputs = ['not json', '{"ok":true}'];
    vi.mocked(llm.generate).mockImplementation(async (_req, onEvent) => {
      onEvent({ type: 'delta', text: outputs.shift()! } as never);
      return { status: 'done' } as never;
    });
    const r = await runOneshotParsed({ task: 'assist', prompt: 'p', purpose: 'judge' }, (t) =>
      t.startsWith('{') ? JSON.parse(t) : null,
    );
    expect(r).toEqual({ value: { ok: true }, cancelled: false });
    const reqs = vi.mocked(llm.generate).mock.calls.map((c) => c[0]);
    expect(reqs.map((q) => q.settings.temperature)).toEqual([0.2, 0.35]);
    expect(reqs.every((q) => q.keepChat === true && q.mode === 'oneshot')).toBe(true);
  });
});
