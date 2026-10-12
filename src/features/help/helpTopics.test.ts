import { describe, expect, it } from 'vitest';
import { helpContext, searchHelp } from './helpTopics';

const titles = (q: string) => searchHelp(q).map((t) => t.title);

describe('searchHelp', () => {
  it('質問に関係するヘルプの項目を選ぶ', () => {
    expect(titles('タイマーや制限時間の設定はどこ？')[0]).toContain('時間を測る');
    expect(titles('バックアップを取りたい')).toContain('バックアップ');
    expect(titles('AI モデルを入れるには？')).toContain('AI モデルを入れる');
    expect(titles('WebGPU が使えない')[0]).toBe('WebGPU が使えないとき');
  });

  it('関係するものがなければ、画面の構成を添えて「見当たらない」と答えるよう伝える', () => {
    expect(searchHelp('qqqq')).toEqual([]);
    const ctx = helpContext('qqqq');
    expect(ctx).toContain('## 画面の構成');
    expect(ctx).toContain('ヘルプに見当たりませんでした');
  });
});
