import { describe, expect, it } from 'vitest';
import { assistPrompt, reactionPrompt } from './assist';

const card = { kind: '一問一答', content: { question: 'Q', answer: 'A' } };
const withAnswer = { ...card, user_answer: { text: 'B', app_check: '判定なし' } };

describe('assist prompts', () => {
  it('書いた答えがあるときだけ、それに触れるよう指示する', () => {
    expect(assistPrompt('explain', card)).not.toContain('user_answer');
    expect(assistPrompt('explain', withAnswer)).toContain(
      'user_answer はユーザーが自分で書いた答え',
    );
    expect(reactionPrompt(3, card, { done: 1, correctStreak: 1 })).not.toContain(
      '自分で答えを書いて',
    );
    expect(reactionPrompt(3, withAnswer, { done: 1, correctStreak: 1 })).toContain(
      '自分で答えを書いて',
    );
  });
});
