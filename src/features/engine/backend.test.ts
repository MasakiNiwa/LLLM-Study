import { describe, expect, it } from 'vitest';
import { isWebGpuError, resolveBackend } from './backend';

describe('resolveBackend', () => {
  it('auto は WebGPU の有無で GPU / CPU を選ぶ', () => {
    expect(resolveBackend('auto', true)).toBe('gpu-artisan');
    expect(resolveBackend('auto', false)).toBe('cpu');
    // 未判定のときは GPU を試す（失敗時は CPU での再試行を案内する）
    expect(resolveBackend('auto', null)).toBe('gpu-artisan');
  });

  it('明示指定はそのまま使う', () => {
    expect(resolveBackend('cpu', true)).toBe('cpu');
    expect(resolveBackend('gpu', false)).toBe('gpu');
  });
});

describe('isWebGpuError', () => {
  it('GPU アダプタ・WebGPU 関連のエラーを判定する', () => {
    expect(isWebGpuError('No GPU adapter found.')).toBe(true);
    expect(isWebGpuError("Cannot read properties of undefined (reading 'requestAdapter')")).toBe(
      true,
    );
    expect(isWebGpuError('Failed to fetch model file')).toBe(false);
  });
});
