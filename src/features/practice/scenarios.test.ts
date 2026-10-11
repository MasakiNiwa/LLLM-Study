import { describe, expect, it } from 'vitest';
import {
  feedbackPrompt,
  parseFeedback,
  rolePlayPrompt,
  SCENARIOS,
  splitTranslation,
} from './scenarios';

describe('practice', () => {
  it('役割・言語・取り入れる語句がプロンプトに入る', () => {
    const p = rolePlayPrompt({
      scenario: SCENARIOS[0],
      lang: 'en',
      level: 'easy',
      vocab: ['take', 'No worries'],
    });
    expect(p).toContain('カフェの店員');
    expect(p).toContain('英語だけで話す');
    expect(p).toContain('take, No worries');
  });

  it('発言と訳を分ける', () => {
    expect(
      splitTranslation('Hi! What can I get you?\n訳: いらっしゃいませ。何にしますか？'),
    ).toEqual({
      line: 'Hi! What can I get you?',
      translation: 'いらっしゃいませ。何にしますか？',
    });
    expect(splitTranslation('Hello!')).toEqual({ line: 'Hello!' });
  });

  it('添削結果を検証し、直していないものは除く', () => {
    const f = parseFeedback(
      '```json\n{"corrections":[{"original":"I want coffee hot","corrected":"I\'d like a hot coffee.","meaning":"ホットコーヒーをください","note":"丁寧な注文"},{"original":"Thanks","corrected":"Thanks"}],"good":"積極的でした"}\n```',
    );
    expect(f?.corrections).toHaveLength(1);
    expect(f?.good).toBe('積極的でした');
    expect(parseFeedback('{"corrections":"none"}')).toBeNull();
    expect(feedbackPrompt('en', ['a'])).toContain('["a"]');
  });
});
