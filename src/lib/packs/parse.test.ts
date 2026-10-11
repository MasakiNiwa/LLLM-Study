import { describe, expect, it } from 'vitest';
import { extractJson, parsePackText } from './parse';

const minimal = {
  format: 'lllm-study-pack',
  version: 1,
  id: 'test-pack',
  title: 'テスト',
  items: [{ id: 'w1', type: 'vocab', term: 'apple', meanings: ['りんご'] }],
};

describe('extractJson', () => {
  it('コードブロックの中身を取り出す', () => {
    expect(extractJson('はい、どうぞ。\n```json\n{"a":1}\n```\n以上です')).toBe('{"a":1}');
  });
  it('前後の文章を取り除く', () => {
    expect(extractJson('Here: {"a":{"b":1}} thanks')).toBe('{"a":{"b":1}}');
  });
});

describe('parsePackText', () => {
  it('正しいパックを読み込む', () => {
    const r = parsePackText(JSON.stringify(minimal));
    expect(r.ok).toBe(true);
  });

  it('末尾のカンマを許容し、警告を出す', () => {
    const text =
      '{"format":"lllm-study-pack","version":1,"id":"x","title":"t","items":[{"id":"a","type":"qa","question":"q, ]","answer":"a",},],}';
    const r = parsePackText(text);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.warnings).toHaveLength(1);
      expect(r.pack.items[0]).toMatchObject({ question: 'q, ]' });
    }
  });

  it('形式の誤りを場所付きで返す', () => {
    const r = parsePackText(
      JSON.stringify({
        ...minimal,
        items: [{ id: 'w1', type: 'vocab', term: 'apple', meanings: [] }],
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0].path).toBe('items[0].meanings');
  });

  it('ID の重複を検出する', () => {
    const r = parsePackText(
      JSON.stringify({ ...minimal, items: [minimal.items[0], minimal.items[0]] }),
    );
    expect(r.ok).toBe(false);
  });

  it('穴埋めは {{ }} が必要', () => {
    const r = parsePackText(
      JSON.stringify({ ...minimal, items: [{ id: 'c1', type: 'cloze', text: 'no blank' }] }),
    );
    expect(r.ok).toBe(false);
  });

  it('選択問題の answer は範囲内', () => {
    const r = parsePackText(
      JSON.stringify({
        ...minimal,
        items: [{ id: 'q1', type: 'choice', question: 'q', choices: ['a', 'b'], answer: 2 }],
      }),
    );
    expect(r.ok).toBe(false);
  });

  it('配列だけの場合は案内する', () => {
    const r = parsePackText('[{"id":"a"}]');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('パック全体');
  });
});
