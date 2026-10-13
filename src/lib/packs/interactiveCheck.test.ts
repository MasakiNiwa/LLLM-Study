import { describe, expect, it } from 'vitest';
import {
  checkJournal,
  checkMatch,
  checkMulti,
  checkNumeric,
  checkTable,
  journalAccounts,
  parseNumber,
  seededShuffle,
} from './interactiveCheck';

describe('parseNumber', () => {
  it('桁区切り・全角・単位・マイナス・分数を読み取る', () => {
    expect(parseNumber('1,234,567')).toBe(1234567);
    expect(parseNumber('１２，０００円')).toBe(12000);
    expect(parseNumber('¥3,000')).toBe(3000);
    expect(parseNumber('5%')).toBe(5);
    expect(parseNumber('△1,000')).toBe(-1000);
    expect(parseNumber('-2.5')).toBe(-2.5);
    expect(parseNumber('3/4')).toBe(0.75);
    expect(parseNumber('')).toBeNull();
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('1.2.3')).toBeNull();
  });
});

describe('checkNumeric', () => {
  it('許容誤差の範囲なら正解', () => {
    expect(checkNumeric('136,162', { answer: 136162 }).correct).toBe(true);
    expect(checkNumeric('136,163', { answer: 136162 }).correct).toBe(false);
    expect(checkNumeric('136,163', { answer: 136162, tolerance: 1 }).correct).toBe(true);
    expect(checkNumeric('0.1', { answer: 0.30000000000000004 - 0.2 }).correct).toBe(true);
    expect(checkNumeric('', { answer: 0 }).correct).toBe(false);
  });
});

describe('checkMulti', () => {
  it('選んだものが正解とちょうど同じなら正解', () => {
    expect(checkMulti([3, 0], { answers: [0, 3] })).toBe(true);
    expect(checkMulti([0], { answers: [0, 3] })).toBe(false);
    expect(checkMulti([0, 1, 3], { answers: [0, 3] })).toBe(false);
  });
});

describe('checkMatch', () => {
  it('行ごとに判定する', () => {
    const item = {
      pairs: [
        { left: 'a', right: '1' },
        { left: 'b', right: '2' },
      ],
    };
    expect(checkMatch(['1', '2'], item).correct).toBe(true);
    expect(checkMatch(['2', '1'], item)).toEqual({ rows: [false, false], correct: false });
    expect(checkMatch(['1', null], item).correct).toBe(false);
  });
});

describe('checkTable', () => {
  const item = {
    rows: [
      ['1', '{{136,162}}', '1,859,410'],
      ['2', '利息', '{{952,381}}'],
    ],
  };
  it('数値は桁区切りの有無を問わない', () => {
    expect(checkTable(['136162', '952,381'], item)).toEqual({ cells: [true, true], correct: true });
    expect(checkTable(['136162', '952,380'], item).correct).toBe(false);
  });
  it('文字のマスは表記の違い（大文字小文字・空白）を無視する', () => {
    expect(checkTable(['使用権 資産'], { rows: [['{{使用権資産}}', 'x']] }).correct).toBe(true);
  });
});

describe('checkJournal', () => {
  const item = {
    debit: [{ account: '使用権資産', amount: 2723248 }],
    credit: [{ account: 'リース負債', amount: 2723248 }],
  };
  it('科目と金額が一致すれば正解', () => {
    const r = checkJournal(
      {
        debit: [{ account: '使用権資産', amount: '2,723,248' }],
        credit: [{ account: 'リース負債', amount: '2723248' }],
      },
      item,
    );
    expect(r.correct).toBe(true);
  });
  it('行の順・空の行は問わず、同じ科目を分けて書いても合計で判定する', () => {
    const item2 = {
      debit: [
        { account: '支払利息', amount: 136162 },
        { account: 'リース負債', amount: 863838 },
      ],
      credit: [{ account: '現金預金', amount: 1000000 }],
    };
    const r = checkJournal(
      {
        debit: [
          { account: 'リース負債', amount: '863,838' },
          { account: '', amount: '' },
          { account: '支払利息', amount: '136,162' },
        ],
        credit: [
          { account: '現金預金', amount: '500,000' },
          { account: '現金預金', amount: '500,000' },
        ],
      },
      item2,
    );
    expect(r.correct).toBe(true);
    expect(r.debit.rows).toEqual([true, false, true]);
  });
  it('科目や金額が違えば不正解（行ごとの結果も返す）', () => {
    const r = checkJournal(
      {
        debit: [{ account: 'リース資産', amount: '2,723,248' }],
        credit: [{ account: 'リース負債', amount: '2,000,000' }],
      },
      item,
    );
    expect(r.correct).toBe(false);
    expect(r.debit.rows).toEqual([false]);
    expect(r.credit.rows).toEqual([false]);
  });
  it('科目の選択肢は正解と紛らわしい科目で、種で並びが決まる', () => {
    const a = journalAccounts({ ...item, accounts: ['リース資産', '未払金'] }, 's1');
    expect([...a].sort()).toEqual(['リース資産', 'リース負債', '使用権資産', '未払金'].sort());
    expect(journalAccounts({ ...item, accounts: ['リース資産', '未払金'] }, 's1')).toEqual(a);
    expect(seededShuffle([1, 2, 3, 4, 5], 'x')).toHaveLength(5);
  });
});
