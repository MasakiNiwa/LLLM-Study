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

describe('設定の移行', () => {
  it('v4: Gemini だけの設定を、クラウド AI ごとの設定に移す', async () => {
    const { migrateSettings } = await import('./settingsStore');
    const out = migrateSettings(
      {
        aiProvider: 'gemini',
        geminiModel: 'gemini-3.5-flash-lite',
        cloudConsent: true,
        reaction: 'llm',
      },
      3,
    ) as Record<string, unknown>;
    expect(out.cloudModels).toEqual({ gemini: 'gemini-3.5-flash-lite' });
    expect(out.cloudConsents).toEqual({ gemini: true });
    expect(out.aiProvider).toBe('gemini');
    expect('geminiModel' in out).toBe(false);
    expect('cloudConsent' in out).toBe(false);
  });

  it('v4: クラウド AI を使っていなかった人は空のまま', async () => {
    const { migrateSettings } = await import('./settingsStore');
    const out = migrateSettings({ reaction: 'llm' }, 3) as Record<string, unknown>;
    expect(out.cloudModels).toEqual({});
    expect(out.cloudConsents).toEqual({});
  });
});
