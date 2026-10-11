import { describe, expect, it } from 'vitest';
import { checkAnswer, normalizeAnswer } from './answerCheck';

describe('normalizeAnswer', () => {
  it('大文字小文字・句読点・全角・引用符の違いを無視する', () => {
    expect(normalizeAnswer('  No Worries! ')).toBe('no worries');
    expect(normalizeAnswer('I’m in.')).toBe("i'm in");
    expect(normalizeAnswer('ＴＡＫＥ')).toBe('take');
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
});
