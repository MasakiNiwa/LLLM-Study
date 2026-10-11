import { describe, expect, it } from 'vitest';
import { clozeAnswers, clozeFull, itemAnswer, itemForLlm, itemSearchText } from './itemText';

describe('itemText', () => {
  it('穴埋め', () => {
    expect(clozeFull('I look {{forward}} to {{seeing}} you.')).toBe(
      'I look forward to seeing you.',
    );
    expect(clozeAnswers('I look {{forward}} to {{seeing}} you.')).toEqual(['forward', 'seeing']);
  });

  it('答えと検索文字列', () => {
    const item = { id: 'a', type: 'vocab' as const, term: 'Run', meanings: ['走る', '経営する'] };
    expect(itemAnswer(item)).toBe('走る、経営する');
    expect(itemSearchText(item)).toContain('run');
  });

  it('LLM 向けには ID を除き、選択問題は正解を添える', () => {
    const item = {
      id: 'q',
      type: 'choice' as const,
      question: 'Q',
      choices: ['x', 'y'],
      answer: 1,
      tags: [],
    };
    expect(itemForLlm(item)).toEqual({
      type: 'choice',
      question: 'Q',
      choices: ['x', 'y'],
      answer: 1,
      correct_choice: 'y',
    });
  });
});
