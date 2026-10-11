import { describe, expect, it } from 'vitest';
import { userMessageSuffix } from './modelQuirks';

describe('userMessageSuffix', () => {
  it('Qwen3 で思考オフなら /no_think を付ける', () => {
    expect(userMessageSuffix('Qwen3-0.6B.litertlm', false)).toBe(' /no_think');
    expect(userMessageSuffix('Qwen3-0.6B.litertlm', true)).toBe('');
  });

  it('他のモデルには付けない', () => {
    expect(userMessageSuffix('gemma-4-E2B-it-web.litertlm', false)).toBe('');
    expect(userMessageSuffix(undefined, false)).toBe('');
  });
});
