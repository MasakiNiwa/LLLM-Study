import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import { installPack } from '@/lib/packs/install';
import { DEFAULT_SETTINGS } from '@/features/settings/settingsStore';
import { saveRating } from '@/features/study/repository';
import { executeTool, proposalFromArgs } from './tools';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await installPack(
    {
      format: 'lllm-study-pack',
      version: 1,
      id: 'p',
      title: '基本動詞',
      items: [
        { id: 'take', type: 'vocab', term: 'take', meanings: ['取る'] },
        { id: 'make', type: 'vocab', term: 'make', meanings: ['作る'] },
      ],
    },
    'import',
  );
});

describe('tools', () => {
  it('学習状況', async () => {
    const r = (await executeTool(
      { name: 'get_study_status', arguments: {} },
      DEFAULT_SETTINGS,
    )) as {
      packs: { title: string; cards: number }[];
    };
    expect(r.packs[0]).toMatchObject({ title: '基本動詞', cards: 2 });
  });

  it('検索は日本語の意味でも当たる', async () => {
    const r = (await executeTool(
      { name: 'search_items', arguments: { query: '作る' } },
      DEFAULT_SETTINGS,
    )) as { count: number };
    expect(r.count).toBe(1);
  });

  it('苦手な項目は忘れた回数の多い順', async () => {
    const card = (await db.cards.get('p/take#recognize'))!;
    await saveRating(card, 1, 1000, DEFAULT_SETTINGS);
    const r = (await executeTool({ name: 'get_weak_items', arguments: {} }, DEFAULT_SETTINGS)) as {
      items: { title: string }[];
    };
    expect(r.items[0].title).toBe('take');
  });

  it('学習履歴は指定日数ぶん返す', async () => {
    const r = (await executeTool(
      { name: 'get_review_history', arguments: { days: 3 } },
      DEFAULT_SETTINGS,
    )) as { days: unknown[] };
    expect(r.days).toHaveLength(3);
  });

  it('知らないツール', async () => {
    expect(await executeTool({ name: 'nope', arguments: {} }, DEFAULT_SETTINGS)).toHaveProperty(
      'error',
    );
  });

  it('カードの提案は画面に渡し、勝手に保存しない', async () => {
    const proposals: unknown[] = [];
    const r = await executeTool(
      {
        name: 'propose_card',
        arguments: { type: 'vocab', front: 'serendipity', back: '偶然の幸運、思いがけない発見' },
      },
      DEFAULT_SETTINGS,
      { onProposal: (d) => proposals.push(d) },
    );
    expect(r).toMatchObject({ status: 'shown_to_user' });
    expect(proposals[0]).toMatchObject({
      term: 'serendipity',
      meanings: ['偶然の幸運', '思いがけない発見'],
    });
    expect(await db.packs.get('my-cards')).toBeUndefined();
  });

  it('形式に合わない提案はエラーを返す', () => {
    expect(typeof proposalFromArgs({ type: 'vocab', front: 'x', back: '' })).toBe('string');
    expect(typeof proposalFromArgs({ type: 'other', front: 'x', back: 'y' })).toBe('string');
  });
});
