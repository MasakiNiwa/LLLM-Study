import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '@/features/settings/settingsStore';
import { buildSystemPrompt, userProfileText } from './prompt';

describe('ユーザーについて', () => {
  it('設定したものだけを伝え、何もなければ入れない', () => {
    expect(userProfileText({ userGender: '', userAge: '' })).toBe('');
    expect(userProfileText({ userGender: 'female', userAge: '' })).toBe('性別: 女性');
    const p = buildSystemPrompt(
      { ...DEFAULT_SETTINGS, userGender: 'male', userAge: '40s' },
      {
        tools: false,
      },
    );
    expect(p).toContain('【ユーザーについて】性別: 男性、年齢層: 40 代');
    expect(buildSystemPrompt(DEFAULT_SETTINGS, { tools: false })).not.toContain('ユーザーについて');
  });
});
