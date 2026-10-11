import { describe, expect, it } from 'vitest';
import { languageName, speechLang } from './lang';

describe('lang', () => {
  it('言語コードを読み上げ用のタグにする', () => {
    expect(speechLang('en')).toBe('en-US');
    expect(speechLang('ja')).toBe('ja-JP');
    expect(speechLang('en-GB')).toBe('en-GB');
    expect(speechLang(undefined)).toBe('en-US');
  });
  it('表示名', () => {
    expect(languageName('ja')).toBe('日本語');
    expect(languageName(undefined)).toBe('英語');
  });
});
