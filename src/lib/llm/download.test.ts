import { describe, expect, it } from 'vitest';
import { fileNameFromUrl, normalizeModelUrl } from './download';

describe('normalizeModelUrl', () => {
  it('Hugging Face の blob URL を resolve に変換する', () => {
    expect(normalizeModelUrl('https://huggingface.co/org/repo/blob/main/model-web.litertlm')).toBe(
      'https://huggingface.co/org/repo/resolve/main/model-web.litertlm',
    );
  });

  it('resolve URL と他サイトの URL はそのまま', () => {
    const u = 'https://huggingface.co/org/repo/resolve/main/a.litertlm?download=true';
    expect(normalizeModelUrl(u)).toBe(u);
    expect(normalizeModelUrl('https://example.com/blob/a.litertlm')).toBe(
      'https://example.com/blob/a.litertlm',
    );
  });
});

describe('fileNameFromUrl', () => {
  it('末尾の .litertlm ファイル名を返す', () => {
    expect(fileNameFromUrl('https://huggingface.co/o/r/resolve/main/x-web.litertlm?a=1')).toBe(
      'x-web.litertlm',
    );
  });

  it('.litertlm でない・不正な URL は null', () => {
    expect(fileNameFromUrl('https://huggingface.co/o/r/tree/main')).toBeNull();
    expect(fileNameFromUrl('not a url')).toBeNull();
  });
});
