import { describe, expect, it } from 'vitest';
import {
  clozeAnswers,
  clozeFull,
  expectedAnswer,
  itemAnswer,
  itemForLlm,
  itemSearchText,
} from './itemText';

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

  it('答え合わせの正解（意味は括弧や区切りを外した候補も含む）', () => {
    const item = {
      id: 'a',
      type: 'vocab' as const,
      term: 'take',
      meanings: ['取る', '（時間が）かかる', '連れて行く・持って行く'],
    };
    expect(expectedAnswer(item, 'recall')).toEqual({ accepted: ['take'] });
    const r = expectedAnswer(item, 'recognize') as { accepted: string[] };
    expect(r.accepted).toEqual(expect.arrayContaining(['取る', 'かかる', '持って行く']));
    expect(expectedAnswer({ id: 'c', type: 'cloze', text: 'a {{b}} c {{d}}' }, 'basic')).toEqual({
      blanks: ['b', 'd'],
    });
  });
});
