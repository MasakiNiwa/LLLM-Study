import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseTable, parseTableRows, tableToPack } from './table';

describe('parseTable', () => {
  it('タブ区切りとカンマ区切りを読み分ける', () => {
    expect(detectDelimiter('a\tb\nc\td')).toBe('\t');
    expect(detectDelimiter('a,b')).toBe(',');
    expect(parseTable('apple\tりんご\nbook\t本\n')).toEqual([
      ['apple', 'りんご'],
      ['book', '本'],
    ]);
  });

  it('引用符・改行・HTML・Anki の設定行に対応する', () => {
    const text =
      '#separator:tab\n#html:true\n"a, b",「x」\n"line1\nline2","say ""hi"""\n<b>bold</b><br>next,&lt;tag&gt; &amp; more\n\n';
    expect(parseTable(text, ',')).toEqual([
      ['a, b', '「x」'],
      ['line1\nline2', 'say "hi"'],
      ['bold\nnext', '<tag> & more'],
    ]);
  });
});

describe('parseTableRows', () => {
  it('HTML のタグだけを取り除き、普通の < > は残す', () => {
    expect(parseTable('List<String>\tx<y>z\n<b>x</b><br>y\t<div>z</div>')).toEqual([
      ['List<String>', 'x<y>z'],
      ['x\ny', 'z'],
    ]);
  });

  it('元のテキストの行番号を覚える（空行・設定行・セル内の改行を数える）', () => {
    const rows = parseTableRows('#separator:tab\n\na\t"1\n2"\nb\tB\n');
    expect(rows.map((r) => r.line)).toEqual([3, 5]);
    const r = tableToPack(
      rows.map((x) => x.cells).concat([['c', 'x'.repeat(2100)]]),
      { type: 'qa', title: 'T', header: false },
      [...rows.map((x) => x.line), 9],
    );
    expect(!r.ok && r.issues[0].path).toBe('9 行目（answer）');
  });
});

describe('tableToPack', () => {
  const rows = [
    ['英語', '意味', 'メモ'],
    ['take', '取る; 持っていく', '基本動詞'],
    ['take', '（時間が）かかる'],
    ['', '空欄'],
    ['get', '得る'],
  ];

  it('単語の教材にする（意味は ; で分け、同じ見出し語は別の項目にする）', () => {
    const r = tableToPack(rows, {
      type: 'vocab',
      title: '私の単語帳',
      header: true,
      targetLang: 'en',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.items).toHaveLength(3);
    expect(r.pack.items[0]).toMatchObject({
      type: 'vocab',
      term: 'take',
      meanings: ['取る', '持っていく'],
      notes: '基本動詞',
    });
    expect(r.pack.items[0].id).not.toBe(r.pack.items[1].id);
    expect(r.pack.language).toEqual({ target: 'en', explanation: 'ja' });
    expect(r.warnings).toEqual(['空欄のある 1 行は飛ばしました']);
    // 同じ内容・同じタイトルなら同じ ID（取り込み直すと更新になる）
    const again = tableToPack(rows, { type: 'vocab', title: '私の単語帳', header: true });
    expect(again.ok && again.pack.id).toBe(r.pack.id);
    expect(again.ok && again.pack.items.map((i) => i.id)).toEqual(r.pack.items.map((i) => i.id));
  });

  it('一問一答の教材にする', () => {
    const r = tableToPack([['日本の首都は？', '東京', '1868 年から']], {
      type: 'qa',
      title: 'Q',
      header: false,
    });
    expect(r.ok && r.pack.items[0]).toMatchObject({
      type: 'qa',
      question: '日本の首都は？',
      answer: '東京',
      explanation: '1868 年から',
    });
  });

  it('長すぎる値は行番号つきで指摘する', () => {
    const r = tableToPack(
      [
        ['h', 'h'],
        ['x'.repeat(400), 'y'],
      ],
      {
        type: 'vocab',
        title: 'T',
        header: true,
      },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0].path).toBe('2 行目（term）');
  });

  it('取り込める行が無ければエラー', () => {
    expect(tableToPack([['a']], { type: 'qa', title: 'T', header: false }).ok).toBe(false);
  });
});
