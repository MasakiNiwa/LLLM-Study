import { describe, expect, it } from 'vitest';
import {
  findCatalogModel,
  isBrowserCompatibleName,
  isEmbeddingModelName,
  isGpuOnlyModel,
} from './modelCatalog';

describe('modelCatalog', () => {
  it('Web 版と動作確認済みモデルをブラウザ対応とみなす', () => {
    expect(isBrowserCompatibleName('gemma-4-E2B-it-web.litertlm')).toBe(true);
    expect(isBrowserCompatibleName('Qwen3-0.6B.litertlm')).toBe(true);
    expect(isBrowserCompatibleName('qwen3-0.6b.litertlm')).toBe(true);
    expect(isBrowserCompatibleName('gemma-4-E2B-it-web (1).litertlm')).toBe(true);
    expect(isBrowserCompatibleName('gemma-4-E2B-it.litertlm')).toBe(false);
  });

  it('Gemma 4 の Web 版は WebGPU 専用', () => {
    expect(isGpuOnlyModel('gemma-4-E2B-it-web.litertlm')).toBe(true);
    expect(isGpuOnlyModel('gemma-4-E4B-it-web (1).litertlm')).toBe(true);
    expect(isGpuOnlyModel('Qwen3-0.6B.litertlm')).toBe(false);
    expect(isGpuOnlyModel('my-model.litertlm')).toBe(false);
  });

  it('ファイル名からカタログを引ける', () => {
    expect(findCatalogModel('Qwen3-0.6B.litertlm')?.title).toBe('Qwen3 0.6B');
    expect(findCatalogModel('unknown.litertlm')).toBeUndefined();
  });

  it('埋め込みモデルを判定する', () => {
    expect(isEmbeddingModelName('embeddinggemma-2-text-vision-440m.litertlm')).toBe(true);
    expect(isEmbeddingModelName('embeddinggemma-300m.litertlm')).toBe(true);
    expect(isEmbeddingModelName('gemma-4-E2B-it-web.litertlm')).toBe(false);
  });
});
