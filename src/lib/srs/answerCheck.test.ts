import { describe, expect, it } from 'vitest';
import { checkAnswer, normalizeAnswer } from './answerCheck';

describe('normalizeAnswer', () => {
  it('大文字小文字・句読点・全角・引用符の違いを無視する', () => {
    expect(normalizeAnswer('  No Worries! ')).toBe('no worries');
    expect(normalizeAnswer('I’m in.')).toBe("i'm in");
    expect(normalizeAnswer('ＴＡＫＥ')).toBe('take');
  });

  it('日本語の前後の空白は区別しない（英語の語の間の空白は残す）', () => {
    expect(normalizeAnswer('5 冊まで 2 週間')).toBe(normalizeAnswer('5冊まで2週間'));
    expect(normalizeAnswer('報告、連絡、相談')).toBe('報告連絡相談');
    expect(normalizeAnswer('look forward to')).toBe('look forward to');
  });
});

describe('checkAnswer', () => {
  it('完全一致は正解', () => {
    expect(checkAnswer('Take', { accepted: ['take'] })).toMatchObject({
      verdict: 'correct',
      recommended: 3,
    });
  });

  it('少しのつづり間違いは惜しい（短い語は厳しく）', () => {
    expect(checkAnswer('look forword to', { accepted: ['look forward to'] }).verdict).toBe('close');
    expect(checkAnswer('tke', { accepted: ['take'] }).verdict).toBe('wrong');
  });

  it('違う答えは不正解', () => {
    expect(checkAnswer('make', { accepted: ['take'] })).toMatchObject({
      verdict: 'wrong',
      recommended: 1,
    });
    expect(checkAnswer('', { accepted: ['take'] }).verdict).toBe('wrong');
  });

  it('候補のどれかに合えばよい', () => {
    expect(checkAnswer('Count me in', { accepted: ["I'm in.", 'Count me in.'] }).verdict).toBe(
      'correct',
    );
  });

  it('穴埋めは / 区切りで順番に比べる', () => {
    expect(checkAnswer('forward / seeing', { blanks: ['forward', 'seeing'] }).verdict).toBe(
      'correct',
    );
    expect(checkAnswer('forward', { blanks: ['forward', 'seeing'] }).verdict).toBe('wrong');
  });

  it('穴の数より多く答えたら不正解（空の余りは気にしない）', () => {
    expect(checkAnswer('forward / incorrect', { blanks: ['forward'] }).verdict).toBe('wrong');
    expect(checkAnswer('forward /', { blanks: ['forward'] }).verdict).toBe('correct');
  });
});
