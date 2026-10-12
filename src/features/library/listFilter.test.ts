import { describe, expect, it } from 'vitest';
import { countSubjects, matchesQuery } from './listFilter';

describe('listFilter', () => {
  it('分野ごとの件数を多い順に数える', () => {
    expect(countSubjects(['a', 'b', 'b', 'c', 'b', 'a'], (s) => s)).toEqual([
      ['b', 3],
      ['a', 2],
      ['c', 1],
    ]);
  });

  it('タイトル・説明・タグのどれかに検索語が含まれれば一致する', () => {
    expect(matchesQuery('', ['x'])).toBe(true);
    expect(matchesQuery('敬語', ['ビジネスマナー', undefined, ['敬語', 'マナー']])).toBe(true);
    expect(matchesQuery('English', ['english words'])).toBe(true);
    expect(matchesQuery('歴史', ['化学', null])).toBe(false);
  });
});
