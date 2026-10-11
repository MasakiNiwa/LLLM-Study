import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHEDULER_OPTIONS as opts,
  formatInterval,
  newFsrsFields,
  previewCard,
  rateCard,
  retrievability,
} from './scheduler';

const now = new Date(2026, 9, 11, 9).getTime();

describe('scheduler', () => {
  it('新しいカードを評価すると学習中になり、良いほど間隔が長い', () => {
    const card = newFsrsFields(now);
    const p = previewCard(card, now, opts);
    expect(p[1]).toBeLessThanOrEqual(p[2]);
    expect(p[2]).toBeLessThanOrEqual(p[3]);
    expect(p[3]).toBeLessThan(p[4]);
    const r = rateCard(card, 3, now, opts);
    expect(r.fields.reps).toBe(1);
    expect(r.fields.state).not.toBe(0);
  });

  it('復習を重ねると間隔が伸び、忘れると短くなる', () => {
    let card = newFsrsFields(now);
    let t = now;
    for (let i = 0; i < 4; i++) {
      card = rateCard(card, 3, t, { ...opts, fuzz: false }).fields;
      t = card.due;
    }
    const goodInterval = card.scheduled_days;
    expect(goodInterval).toBeGreaterThan(3);
    const lapsed = rateCard(card, 1, t, { ...opts, fuzz: false }).fields;
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.due - t).toBeLessThan(goodInterval * 86_400_000);
  });

  it('想起率は 0〜1、未学習は undefined', () => {
    const card = newFsrsFields(now);
    expect(retrievability(card, now)).toBeUndefined();
    const learned = rateCard(card, 3, now, opts).fields;
    const r = retrievability(learned, now + 86_400_000);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(1);
  });

  it('間隔の表記', () => {
    expect(formatInterval(30_000)).toBe('1分');
    expect(formatInterval(10 * 60_000)).toBe('10分');
    expect(formatInterval(5 * 3_600_000)).toBe('5時間');
    expect(formatInterval(3 * 86_400_000)).toBe('3日');
    expect(formatInterval(75 * 86_400_000)).toBe('2.5ヶ月');
    expect(formatInterval(730 * 86_400_000)).toBe('2年');
  });
});
