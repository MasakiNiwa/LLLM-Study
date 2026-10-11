import { describe, expect, it } from 'vitest';
import { splitMarkdownBlocks } from './splitBlocks';

describe('splitMarkdownBlocks', () => {
  it('空行で段落を分割する', () => {
    expect(splitMarkdownBlocks('a\nb\n\nc')).toEqual(['a\nb', 'c']);
  });

  it('連続する空行は 1 つの区切りとして扱う', () => {
    expect(splitMarkdownBlocks('a\n\n\n\nb')).toEqual(['a', 'b']);
  });

  it('コードフェンス内の空行では分割しない', () => {
    const md = 'x\n\n```js\nconst a = 1;\n\nconst b = 2;\n```\n\ny';
    expect(splitMarkdownBlocks(md)).toEqual(['x', '```js\nconst a = 1;\n\nconst b = 2;\n```', 'y']);
  });

  it('閉じていないフェンス（ストリーミング途中）は末尾まで 1 ブロック', () => {
    expect(splitMarkdownBlocks('```\na\n\nb')).toEqual(['```\na\n\nb']);
  });

  it('チルダのフェンスと長さの違うフェンスを区別する', () => {
    const md = '````\n```\n\n```\n````\n\nz';
    expect(splitMarkdownBlocks(md)).toEqual(['````\n```\n\n```\n````', 'z']);
  });

  it('空文字列は空配列', () => {
    expect(splitMarkdownBlocks('')).toEqual([]);
  });
});
