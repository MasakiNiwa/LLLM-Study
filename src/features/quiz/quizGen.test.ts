import { describe, expect, it } from 'vitest';
import { gradeQuiz, parseQuiz, relatesToTarget } from './quizGen';

const take = { id: 'v-take', type: 'vocab' as const, term: 'take', meanings: ['取る'] };

describe('relatesToTarget', () => {
  it('活用形や不規則変化を許す', () => {
    expect(relatesToTarget('takes', 'take')).toBe(true);
    expect(relatesToTarget('took', 'take')).toBe(true);
    expect(relatesToTarget('picked up', 'pick up')).toBe(true);
    expect(relatesToTarget('taken', 'take')).toBe(true);
    expect(relatesToTarget('went', 'go')).toBe(true); // 主な不規則動詞は表で持つ
    expect(relatesToTarget('picked it up', 'pick up')).toBe(true);
    expect(relatesToTarget('looking forward to', 'look forward to')).toBe(true);
    expect(relatesToTarget('stopped', 'stop')).toBe(true);
    expect(relatesToTarget('studies', 'study')).toBe(true);
    expect(relatesToTarget('banana', 'take')).toBe(false);
  });

  it('つづりが似ているだけの別の語は受け付けない', () => {
    for (const w of ['table', 'task', 'tape', 'tale', 'ta']) {
      expect(relatesToTarget(w, 'take')).toBe(false);
    }
    expect(relatesToTarget('look up to', 'look forward to')).toBe(false);
  });

  it('教材の forms で活用形を指定できる', () => {
    expect(relatesToTarget('swam', 'swimx')).toBe(false);
    expect(relatesToTarget('swam', 'swimx', ['swam'])).toBe(true);
  });

  it('英語以外は語幹で判定する', () => {
    expect(relatesToTarget('食べた', '食べる')).toBe(true);
    expect(relatesToTarget('食事', '食べる')).toBe(false);
  });
});

describe('parseQuiz', () => {
  it('正しい問題を取り出す', () => {
    const q = parseQuiz(
      '{"sentence":"It ____ an hour.","answer":"takes","translation":"1時間かかる。"}',
      take,
      'p/v-take',
    );
    expect(q).toMatchObject({ sentence: 'It ___ an hour.', answer: 'takes', target: 'take' });
  });

  it('空欄が無い・答えが関係ない問題は使わない', () => {
    expect(typeof parseQuiz('{"sentence":"It takes an hour.","answer":"takes"}', take, 'k')).toBe(
      'string',
    );
    expect(typeof parseQuiz('{"sentence":"I like ___ a lot.","answer":"bananas"}', take, 'k')).toBe(
      'string',
    );
    expect(typeof parseQuiz('むずかしいです', take, 'k')).toBe('string');
  });
});

describe('gradeQuiz', () => {
  const q = { answer: 'went', target: 'go' };
  it('空欄に入る形だけを正解にする', () => {
    expect(gradeQuiz('went', q)).toMatchObject({ check: { verdict: 'correct' }, baseForm: false });
  });
  it('元の形を書いたら「惜しい」にして、形を直すよう伝える', () => {
    expect(gradeQuiz('go', q)).toMatchObject({ check: { verdict: 'close' }, baseForm: true });
  });
  it('答えが元の形と同じなら、そのまま正解', () => {
    expect(gradeQuiz('take', { answer: 'take', target: 'take' }).check.verdict).toBe('correct');
  });
});
