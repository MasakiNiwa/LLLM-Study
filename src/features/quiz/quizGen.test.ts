import { describe, expect, it } from 'vitest';
import { parseQuiz, relatesToTarget } from './quizGen';

const take = { id: 'v-take', type: 'vocab' as const, term: 'take', meanings: ['取る'] };

describe('relatesToTarget', () => {
  it('活用形や不規則変化を許す', () => {
    expect(relatesToTarget('takes', 'take')).toBe(true);
    expect(relatesToTarget('took', 'take')).toBe(true);
    expect(relatesToTarget('picked up', 'pick up')).toBe(true);
    expect(relatesToTarget('went', 'go')).toBe(false); // 形が大きく変わるものは作り直す
    expect(relatesToTarget('banana', 'take')).toBe(false);
  });
});

describe('parseQuiz', () => {
  it('正しい問題を取り出す', () => {
    const q = parseQuiz(
      '{"sentence":"It ____ an hour.","answer":"takes","translation":"1時間かかる。"}',
      take,
      'p/v-take',
    );
    expect(q).toMatchObject({ sentence: 'It ___ an hour.', answer: 'takes', target: 'take' });
  });

  it('空欄が無い・答えが関係ない問題は使わない', () => {
    expect(typeof parseQuiz('{"sentence":"It takes an hour.","answer":"takes"}', take, 'k')).toBe(
      'string',
    );
    expect(typeof parseQuiz('{"sentence":"I like ___ a lot.","answer":"bananas"}', take, 'k')).toBe(
      'string',
    );
    expect(typeof parseQuiz('むずかしいです', take, 'k')).toBe('string');
  });
});
