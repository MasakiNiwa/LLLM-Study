import { describe, expect, it } from 'vitest';
import { draftPrompt, parseDraft } from './draft';

describe('draft', () => {
  it('プロンプトに元の言葉と例が入る', () => {
    const p = draftPrompt('vocab', 'serendipity');
    expect(p).toContain('serendipity');
    expect(p).toContain('"term"');
  });

  it('AI の出力を検証して ID を除いた項目にする', () => {
    const d = parseDraft(
      '```json\n{"id":"x","type":"vocab","term":"serendipity","meanings":["偶然の幸運"]}\n```',
      'vocab',
    );
    expect(d).toEqual({ type: 'vocab', term: 'serendipity', meanings: ['偶然の幸運'] });
  });

  it('形が合わなければ null', () => {
    expect(parseDraft('{"term":"x"}', 'vocab')).toBeNull();
    expect(parseDraft('わかりません', 'qa')).toBeNull();
  });
});
