import { describe, expect, it } from 'vitest';
import { parseJudge } from './judge';

describe('parseJudge', () => {
  it('JSON（前後の文章やコードブロック付きでも）を読み取る', () => {
    expect(parseJudge('{"verdict":"correct","comment":"言い換えとして正しいよ"}')).toEqual({
      verdict: 'correct',
      comment: '言い換えとして正しいよ',
    });
    expect(
      parseJudge('はい\n```json\n{"verdict":"wrong","comment":"意味が違う"}\n```')?.verdict,
    ).toBe('wrong');
  });

  it('形が合わなければ null', () => {
    expect(parseJudge('{"verdict":"maybe","comment":"?"}')).toBeNull();
    expect(parseJudge('正解です')).toBeNull();
  });
});
