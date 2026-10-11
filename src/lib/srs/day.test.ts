import { describe, expect, it } from 'vitest';
import { addDays, computeStreak, diffDays, studyDayEnd, studyDayKey, studyDayStart } from './day';

describe('studyDayKey', () => {
  it('1 日の始まりより前は前日として扱う', () => {
    expect(studyDayKey(new Date(2026, 9, 11, 3, 59), 4)).toBe('2026-10-10');
    expect(studyDayKey(new Date(2026, 9, 11, 4, 0), 4)).toBe('2026-10-11');
    expect(studyDayKey(new Date(2026, 9, 11, 0, 30), 0)).toBe('2026-10-11');
  });

  it('学習日の範囲', () => {
    expect(studyDayStart('2026-10-11', 4)).toBe(new Date(2026, 9, 11, 4).getTime());
    expect(studyDayEnd('2026-10-11', 4)).toBe(new Date(2026, 9, 12, 4).getTime());
  });
});

describe('日付の計算', () => {
  it('月をまたいで足し引きできる', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(diffDays('2026-10-01', '2026-10-11')).toBe(10);
  });

  it('連続日数（今日がまだでも昨日まで続いていれば数える）', () => {
    const days = new Set(['2026-10-08', '2026-10-09', '2026-10-10']);
    expect(computeStreak(days, '2026-10-10')).toBe(3);
    expect(computeStreak(days, '2026-10-11')).toBe(3);
    expect(computeStreak(days, '2026-10-12')).toBe(0);
  });
});
