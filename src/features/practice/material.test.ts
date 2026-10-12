import { describe, expect, it } from 'vitest';
import { materialLine } from './material';

describe('materialLine', () => {
  it('問題と答えを 1 行にし、解説を短く添える', () => {
    expect(
      materialLine({
        type: 'qa',
        id: 'a',
        question: '日本の首都は？',
        answer: '東京',
        explanation: '1869年から',
      }),
    ).toBe('日本の首都は？ → 東京（1869年から）');
    expect(materialLine({ type: 'cloze', id: 'b', text: '水は {{H2O}} と書く' })).toBe(
      '水は H2O と書く',
    );
  });
});
