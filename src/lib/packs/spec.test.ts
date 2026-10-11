import { describe, expect, it } from 'vitest';
import { parsePackText } from './parse';
import { buildMaterialPrompt, buildSpecMarkdown, examplePack } from './spec';

const base = {
  topic: '簿記の勘定科目',
  level: '3級',
  amount: 'auto' as const,
  types: [],
  explanationLang: '日本語（ja）',
  extra: '',
};

describe('buildMaterialPrompt', () => {
  it('種類・量がおまかせなら外部 AI に委ね、語学でなければ学ぶ言語を書かない', () => {
    const p = buildMaterialPrompt(base, { schema: false });
    expect(p).toContain('おまかせ（テーマに合う種類を選ぶ');
    expect(p).toContain('目安 20〜100 個');
    expect(p).not.toContain('学ぶ言語:');
  });

  it('指定があれば種類・分野・学ぶ言語を書く', () => {
    const p = buildMaterialPrompt(
      { ...base, types: ['vocab'], subject: '語学', targetLang: '英語（en）', amount: 'few' },
      { schema: true },
    );
    expect(p).toContain('単語（vocab）');
    expect(p).toContain('- 分野: 語学');
    expect(p).toContain('- 学ぶ言語: 英語（en）');
    expect(p).toContain('JSON Schema');
  });

  it('長文読解では本文つきの例を示し、その例も取り込める形', () => {
    const p = buildMaterialPrompt({ ...base, reading: true }, { schema: false });
    expect(p).toContain('形式: 長文読解');
    const json = p.split('```json\n')[1].split('\n```')[0];
    const r = parsePackText(json);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.pack.passages).toHaveLength(1);
  });

  it('例のパックはそのまま取り込める形', () => {
    for (const types of [
      ['vocab', 'phrase'],
      ['qa', 'cloze', 'choice'],
    ] as const) {
      expect(parsePackText(JSON.stringify(examplePack(types))).ok).toBe(true);
    }
    expect(buildSpecMarkdown()).toContain('# 教材パック形式');
  });
});
