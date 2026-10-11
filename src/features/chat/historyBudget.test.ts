import { describe, expect, it } from 'vitest';
import type { ChatTurn } from '@/lib/llm/types';
import { estimateTokens, trimHistory, TRIM_STEP } from './historyBudget';

const turns = (n: number, text = 'あ'.repeat(100)): ChatTurn[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `t${i}`,
    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
    text,
  }));

describe('historyBudget', () => {
  it('トークン数の概算（日本語は 1 文字 1 トークン、英数字は 4 文字 1 トークン）', () => {
    expect(estimateTokens('あいう')).toBe(3);
    expect(estimateTokens('abcdefgh')).toBe(2);
  });

  it('収まるなら全部渡す', () => {
    const h = turns(6);
    expect(
      trimHistory(h, { maxNumTokens: 4096, maxOutputTokens: 1024, reserved: 500 }),
    ).toHaveLength(6);
  });

  it('収まらなければ古い方から一定の単位で削り、ユーザーの発言から始める', () => {
    const h = turns(40); // 1 件 約 108 トークン × 40
    const r = trimHistory(h, { maxNumTokens: 2048, maxOutputTokens: 512, reserved: 300 });
    expect(r.length).toBeLessThan(40);
    expect((40 - r.length) % TRIM_STEP).toBe(0);
    expect(r[0].role).toBe('user');
    expect(r.at(-1)?.id).toBe('t39');
    const total = r.reduce((s, t) => s + estimateTokens(t.text) + 8, 0);
    expect(total).toBeLessThanOrEqual(2048 - 512 - 300);
  });
});
