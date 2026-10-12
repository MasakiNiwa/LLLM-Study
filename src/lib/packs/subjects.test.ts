import { describe, expect, it } from 'vitest';
import {
  NO_SUBJECT,
  countSubjectGroups,
  isLanguagePack,
  subjectGroupKey,
  subjectGroupLabel,
  subjectLabel,
} from './subjects';

describe('subjects', () => {
  it('分野の表示名（知らない値はそのまま）', () => {
    expect(subjectLabel('money')).toBe('お金');
    expect(subjectLabel('chinese')).toBe('中国語');
    expect(subjectLabel('astronomy')).toBe('astronomy');
    expect(subjectLabel(NO_SUBJECT)).toBe('その他');
  });

  it('分野を大きなまとまりに分ける', () => {
    expect(subjectGroupKey('English')).toBe('english');
    expect(subjectGroupKey('korean')).toBe('languages');
    expect(subjectGroupKey('programming')).toBe('it');
    expect(subjectGroupKey('civics')).toBe('social');
    expect(subjectGroupKey('money')).toBe('business');
    expect(subjectGroupKey('astronomy')).toBe(NO_SUBJECT);
    expect(subjectGroupKey(undefined)).toBe(NO_SUBJECT);
    expect(subjectGroupLabel('math-science')).toBe('数学・理科');
    expect(subjectGroupLabel(NO_SUBJECT)).toBe('その他');
  });

  it('まとまりごとの件数は決まった順（その他は最後）', () => {
    const list = ['money', 'astronomy', 'english', 'it', 'english', 'programming'];
    expect(countSubjectGroups(list, (s) => s)).toEqual([
      ['english', 2],
      ['it', 2],
      ['business', 1],
      [NO_SUBJECT, 1],
    ]);
  });

  it('語学の教材か', () => {
    expect(
      isLanguagePack({ subject: 'chinese', language: { target: 'zh-CN', explanation: 'ja' } }),
    ).toBe(true);
    expect(
      isLanguagePack({ subject: 'money', language: { target: 'ja', explanation: 'ja' } }),
    ).toBe(false);
  });
});
