import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, portableSettings, sanitizeSettings } from './settingsStore';

describe('バックアップの設定', () => {
  it('端末ごとの設定（モデルなど）は書き出さない', () => {
    const p = portableSettings({ ...DEFAULT_SETTINGS, lastModelName: 'm', newPerDay: 20 });
    expect(p.newPerDay).toBe(20);
    expect('lastModelName' in p).toBe(false);
    expect('backend' in p).toBe(false);
  });

  it('型の違う値・知らない項目・端末ごとの設定は取り込まない', () => {
    expect(
      sanitizeSettings({
        newPerDay: 25,
        dayStartHour: 'x',
        persona: 'teacher',
        focusPackId: null,
        unknown: 1,
        lastModelName: 'm',
        backendHints: {},
        retention: Number.NaN,
      }),
    ).toEqual({ newPerDay: 25, persona: 'teacher', focusPackId: null });
  });
});
