import { describe, expect, it } from 'vitest';
import type { StudyItem } from '@/lib/packs/schema';
import { currentUserAnswer, revealOutcome } from './studyStore';

const journal: StudyItem = {
  id: 'j',
  type: 'journal',
  question: '商品 100 円を掛けで仕入れた。',
  debit: [{ account: '仕入', amount: 100 }],
  credit: [{ account: '買掛金', amount: 100 }],
};

function state(item: StudyItem, response: unknown) {
  return {
    current: { item: { item } } as never,
    response: response as never,
    answer: null,
    shownAt: 1,
  };
}

describe('カードの中で答える種類の結果', () => {
  it('答え合わせの結果でひとことの出し分けが決まる', () => {
    expect(
      revealOutcome(state(journal, { shownAt: 1, result: { correct: true, value: {} } })),
    ).toBe('correct');
    expect(
      revealOutcome(state(journal, { shownAt: 1, result: { correct: false, value: {} } })),
    ).toBe('wrong');
    // 答えずに「わからない」で見たとき
    expect(revealOutcome(state(journal, null))).toBe('gaveup');
    // 前の表示の答えは使わない
    expect(
      revealOutcome(state(journal, { shownAt: 0, result: { correct: true, value: {} } })),
    ).toBe('gaveup');
  });

  it('仕訳の答えを AI に渡す文字にする', () => {
    const value = {
      debit: [{ account: '仕入', amount: '100' }],
      credit: [{ account: '未払金', amount: '100' }],
    };
    expect(
      currentUserAnswer(state(journal, { shownAt: 1, result: { correct: false, value } })),
    ).toEqual({
      text: '借方: 仕入 100 / 貸方: 未払金 100',
      verdict: 'wrong',
    });
    expect(currentUserAnswer(state(journal, null))).toBeNull();
  });

  it('選択問題・○×の答えも渡す', () => {
    const choice: StudyItem = {
      id: 'c',
      type: 'choice',
      question: 'q',
      choices: ['a', 'b'],
      answer: 1,
    };
    expect(currentUserAnswer(state(choice, { shownAt: 1, choice: 0 }))).toEqual({
      text: 'a',
      verdict: 'wrong',
    });
    const tf: StudyItem = { id: 't', type: 'truefalse', statement: 's', answer: true };
    expect(
      currentUserAnswer(state(tf, { shownAt: 1, result: { correct: true, value: true } }))?.text,
    ).toBe('○（正しい）');
  });
});
