import { describe, expect, it } from 'vitest';
import { splitThinking } from './thinking';

describe('splitThinking', () => {
  it('思考タグが無ければそのまま', () => {
    expect(splitThinking('こんにちは')).toEqual({ answer: 'こんにちは', thinking: false });
  });

  it('先頭の <think>…</think> を分離する', () => {
    expect(splitThinking('<think> 考え中 </think>\n\nこんにちは！')).toEqual({
      answer: 'こんにちは！',
      thought: '考え中',
      thinking: false,
    });
  });

  it('閉じタグ前（思考の途中）は本文を空にする', () => {
    expect(splitThinking('<think>まだ考えて')).toEqual({
      answer: '',
      thought: 'まだ考えて',
      thinking: true,
    });
  });

  it('タグが途切れている間は何も表示しない', () => {
    expect(splitThinking('<thi')).toEqual({ answer: '', thinking: true });
  });

  it('空の思考（/no_think 時）は thought なし', () => {
    expect(splitThinking('<think>\n\n</think>\n\n回答')).toEqual({
      answer: '回答',
      thought: undefined,
      thinking: false,
    });
  });

  it('本文の途中に現れたタグは分離しない', () => {
    const raw = 'HTML の <think> タグについて';
    expect(splitThinking(raw)).toEqual({ answer: raw, thinking: false });
  });
});
