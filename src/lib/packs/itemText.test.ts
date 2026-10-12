import { describe, expect, it } from 'vitest';
import {
  answersInTargetLanguage,
  clozeAnswers,
  clozeFull,
  expectedAnswer,
  itemAnswer,
  itemForLlm,
  speakTiming,
  itemSearchText,
  orderChunks,
  shuffleChunks,
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

  it('読み上げのタイミング: 答えが分かってしまうものは答えを見たあと', () => {
    const v = { id: 'v', type: 'vocab' as const, term: 'take', meanings: ['取る'] };
    expect(speakTiming(v, 'recognize')).toBe('front');
    expect(speakTiming(v, 'recall')).toBe('back');
    expect(speakTiming({ id: 'c', type: 'cloze', text: 'a {{b}}' }, 'basic')).toBe('back');
    expect(speakTiming({ id: 'o', type: 'order', answer: 'a b' }, 'basic')).toBe('back');
  });

  it('一問一答の別解も正解にする', () => {
    const qa = {
      id: 'q',
      type: 'qa' as const,
      question: 'q',
      answer: '売掛金',
      accepted: ['売掛'],
    };
    expect(expectedAnswer(qa, 'basic')).toEqual({ accepted: ['売掛金', '売掛'] });
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

  it('並べ替え: 語句の取り出しと、正しい順にならないシャッフル', () => {
    const chunks = orderChunks({ answer: 'I have never been to Paris.' });
    expect(chunks).toEqual(['I', 'have', 'never', 'been', 'to', 'Paris.']);
    expect(orderChunks({ answer: '私は学生です', chunks: ['私は', '学生', 'です'] })).toHaveLength(
      3,
    );
    for (const seed of ['a', 'b', 'c', 'd']) {
      const idx = shuffleChunks(chunks, seed);
      expect([...idx].sort()).toEqual([0, 1, 2, 3, 4, 5]);
      expect(idx.map((i) => chunks[i])).not.toEqual(chunks);
    }
    expect(shuffleChunks(chunks, 'x')).toEqual(shuffleChunks(chunks, 'x'));
  });
});

describe('聞き取りカードの答え', () => {
  it('表の指示どおり、聞こえた語句の意味を答える', () => {
    const item = { id: 'w', type: 'vocab' as const, term: 'take', meanings: ['取る'] };
    expect(expectedAnswer(item, 'listen')).toEqual({ accepted: ['取る'] });
    expect(answersInTargetLanguage(item, 'listen')).toBe(false);
    expect(expectedAnswer(item, 'recall')).toEqual({ accepted: ['take'] });
  });
});
