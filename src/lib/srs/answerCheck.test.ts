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

  it('記号の前後の空白は区別しない（数式・コード）', () => {
    expect(normalizeAnswer('(x + 2)(x - 3)')).toBe(normalizeAnswer('(x+2)(x-3)'));
    expect(normalizeAnswer('x = 3')).toBe('x=3');
    expect(normalizeAnswer('[1, 2, 3]')).toBe(normalizeAnswer('[1,2,3]'));
    expect(normalizeAnswer('25 π')).toBe(normalizeAnswer('25π'));
    expect(normalizeAnswer('a == b')).toBe('a==b');
    expect(normalizeAnswer('take care')).toBe('take care');
  });
});

describe('checkAnswer', () => {
  it('句読点だけの答えも判定できる', () => {
    expect(checkAnswer('??', { accepted: ['??'] }).verdict).toBe('correct');
    expect(checkAnswer('?.', { accepted: ['??'] }).verdict).not.toBe('correct');
    expect(checkAnswer('', { accepted: ['??'] }).verdict).toBe('wrong');
  });

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

describe('穴埋めの空欄', () => {
  it('空欄が 1 つなら、答えに「/」があっても分けない（分数・and/or）', () => {
    expect(checkAnswer('1/2', { blanks: ['1/2'] }).verdict).toBe('correct');
    expect(checkAnswer('and/or', { blanks: ['and/or'] }).verdict).toBe('correct');
  });

  it('空欄が 2 つ以上なら、空欄ごとの答えを配列で受け取る', () => {
    expect(checkAnswer(['1/2', 'x'], { blanks: ['1/2', 'x'] }).verdict).toBe('correct');
    expect(checkAnswer(['x', '1/2'], { blanks: ['1/2', 'x'] }).verdict).toBe('wrong');
    // 文字列で渡したときは、これまでどおり「/」区切り
    expect(checkAnswer('look / forward', { blanks: ['look', 'forward'] }).verdict).toBe('correct');
  });
});
