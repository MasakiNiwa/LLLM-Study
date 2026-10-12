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
    expect(feedbackPrompt({ scenario: SCENARIOS[0], lang: 'en' }, ['a'])).toContain('["a"]');
  });

  it('ビジネス・理解を深める練習は、日本語なら訳を付けず、場面の指示や材料を渡す', () => {
    const interview = SCENARIOS.find((s) => s.id === 'interview')!;
    const p = rolePlayPrompt({ scenario: interview, lang: 'ja', level: 'hard', vocab: [] });
    expect(p).toContain('面接官');
    expect(p).toContain('手ごわい');
    expect(p).not.toContain('訳:');
    const oral = SCENARIOS.find((s) => s.id === 'oral-exam')!;
    const q = rolePlayPrompt({
      scenario: oral,
      lang: 'ja',
      level: 'easy',
      vocab: [],
      topic: '簿記',
      material: ['現金: 他人振出しの小切手も含む'],
    });
    expect(q).toContain('話題: 簿記');
    expect(q).toContain('- 現金: 他人振出しの小切手も含む');
    expect(
      feedbackPrompt(
        { scenario: oral, lang: 'ja', topic: '簿記' },
        ['a'],
        [
          { role: 'assistant', text: 'Q' },
          { role: 'user', text: 'a' },
        ],
      ),
    ).toContain('「簿記」について');
    expect(
      feedbackPrompt({ scenario: interview, lang: 'ja' }, ['よろしくお願いします']),
    ).not.toContain('meaning');
  });
});
