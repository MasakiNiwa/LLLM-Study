import { describe, expect, it } from 'vitest';
import { adjustSpeechLang, languageName, speechLang } from './lang';

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
  it('文字から言語を補正する（英語とみなした場合だけ）', () => {
    expect(adjustSpeechLang('私は学生です', 'en-US')).toBe('ja-JP');
    expect(adjustSpeechLang('안녕하세요', 'en-US')).toBe('ko-KR');
    expect(adjustSpeechLang('Hello', 'en-US')).toBe('en-US');
    expect(adjustSpeechLang('你好', 'zh-CN')).toBe('zh-CN');
  });
});
