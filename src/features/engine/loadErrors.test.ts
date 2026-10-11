import { describe, expect, it } from 'vitest';
import { classifyLoadError, explainLoadError } from './loadErrors';

describe('classifyLoadError', () => {
  it('LiteRT-LM のエラーメッセージを分類する', () => {
    expect(classifyLoadError('No GPU adapter found.')).toBe('webgpu');
    expect(classifyLoadError('Streaming HF_Tokenizer_Zlib section is not supported yet.')).toBe(
      'streaming-unsupported',
    );
    expect(classifyLoadError('Invalid magic number or failed to read: xx')).toBe('invalid-file');
    expect(classifyLoadError('Array buffer allocation failed')).toBe('memory');
    expect(classifyLoadError('something else')).toBe('unknown');
  });
});

describe('explainLoadError', () => {
  it('Web 版でないファイルには Web 版を勧める', () => {
    expect(explainLoadError('streaming-unsupported', 'gemma-4-E2B-it.litertlm')).toContain(
      '-web.litertlm',
    );
    expect(explainLoadError('unknown', 'gemma-4-E2B-it-web.litertlm')).toBeUndefined();
    expect(explainLoadError('memory', 'gemma-4-E2B-it.litertlm')).toContain('-web.litertlm');
    expect(explainLoadError('memory', 'gemma-4-E2B-it-web.litertlm')).not.toContain('-web');
  });

  it('WebGPU が無いとき、WebGPU 専用モデルには CPU ではなく別モデルを勧める', () => {
    expect(explainLoadError('webgpu', 'gemma-4-E2B-it-web.litertlm')).toContain('Qwen3');
    expect(explainLoadError('webgpu', 'Qwen3-0.6B.litertlm')).toContain('CPU で読み込めます');
  });
});
