import { describe, expect, it } from 'vitest';
import {
  assistPrompt,
  parseReactionLines,
  pickReactionLineCount,
  revealReactionPrompt,
} from './assist';

const card = { kind: '一問一答', content: { question: 'Q', answer: 'A' } };
const withAnswer = { ...card, user_answer: { text: 'B', app_check: '判定なし' } };
const stats = { done: 1, correctStreak: 1 };

describe('assist prompts', () => {
  it('書いた答えがあるときだけ、それに触れるよう指示する', () => {
    expect(assistPrompt('explain', card)).not.toContain('user_answer');
    expect(assistPrompt('explain', withAnswer)).toContain(
      'user_answer はユーザーが自分で書いた答え',
    );
    expect(revealReactionPrompt('correct', 1, card, stats)).not.toContain('自分で答えを書いて');
    expect(revealReactionPrompt('correct', 1, withAnswer, stats)).toContain('自分で答えを書いて');
  });

  it('答えを見たときのひとことは、結果と行数をアプリが決めて伝える', () => {
    const p = revealReactionPrompt('timeout', 3, card, stats);
    expect(p).toContain('制限時間内に答えられなかった');
    expect(p).toContain('ちょうど 3 行');
  });
});

describe('ひとことの吹き出し', () => {
  it('たいていは 1 つ、ときどき 2〜3 つ', () => {
    expect(pickReactionLineCount(0.1)).toBe(1);
    expect(pickReactionLineCount(0.7)).toBe(2);
    expect(pickReactionLineCount(0.95)).toBe(3);
  });

  it('行に分け、番号や記号・かぎかっこを取り、決めた数までにする', () => {
    expect(parseReactionLines('1. 「いいね！」\n\n- 次もこの調子😊\n3) おまけ', 2)).toEqual([
      'いいね！',
      '次もこの調子😊',
    ]);
  });
});
