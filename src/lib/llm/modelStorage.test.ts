import { describe, expect, it } from 'vitest';
import { isModelFileName } from './modelStorage';

describe('isModelFileName', () => {
  it('モデル本体だけを対象にし、メタデータや書き込み途中のファイルを除く', () => {
    expect(isModelFileName('gemma-4-E2B-it-web.litertlm')).toBe(true);
    expect(isModelFileName('model.task')).toBe(true);
    expect(isModelFileName('gemma-4-E2B-it-web.litertlm.meta.json')).toBe(false);
    expect(isModelFileName('gemma-4-E2B-it-web.litertlm.crswap')).toBe(false);
    expect(isModelFileName('.hidden')).toBe(false);
  });
});
