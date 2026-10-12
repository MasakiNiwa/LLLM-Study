import { describe, expect, it } from 'vitest';
import { getPersona, greetingText, PERSONAS, reactionText, revealText } from './personas';

describe('personas', () => {
  it('すべての性格に必要なテンプレートがある', () => {
    for (const p of PERSONAS) {
      for (const g of [1, 2, 3, 4] as const) expect(p.reactions[g].length).toBeGreaterThan(0);
      expect(p.due.every((t) => t.includes('{n}'))).toBe(true);
      expect(p.streak.every((t) => t.includes('{n}'))).toBe(true);
    }
  });

  it('5 連続正解ごとに連続の言葉になる', () => {
    const p = getPersona('buddy');
    expect(reactionText(p, 3, 5, 0)).toContain('5');
    expect(PERSONAS[0].reactions[3]).toContain(reactionText(p, 3, 4, 0));
  });

  it('あいさつに残り枚数が入る', () => {
    const p = getPersona('teacher');
    expect(greetingText(p, { hour: 9, remaining: 12, packCount: 1 }, 0)).toContain('12');
    expect(greetingText(p, { hour: 9, remaining: 0, packCount: 0 }, 0)).toBe(p.noPacks[0]);
  });

  it('カスタムは説明文を使い、空なら既定の性格', () => {
    expect(getPersona('custom', '関西弁で話す').style).toBe('関西弁で話す');
    expect(getPersona('custom', '').style).toBe(PERSONAS[0].style);
    expect(getPersona('unknown').id).toBe('buddy');
  });
});

describe('revealText', () => {
  const buddy = getPersona('buddy');
  it('結果が分かれば評価のひとこと、自分で答え合わせ中なら確認を促すひとこと', () => {
    expect(buddy.reactions[1]).toContain(revealText(buddy, 'wrong', 0, 0));
    expect(buddy.reactions[1]).toContain(revealText(buddy, 'timeout', 0, 0));
    expect(buddy.reactions[3]).toContain(revealText(buddy, 'correct', 0, 0));
    expect(revealText(buddy, 'self', 0, 0)).not.toBe('');
    expect(revealText(getPersona('custom', '関西弁'), 'self', 0, 0)).not.toBe('');
  });
});
