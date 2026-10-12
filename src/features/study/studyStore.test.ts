import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import { expectedAnswer } from '@/lib/packs/itemText';
import { installPack } from '@/lib/packs/install';
import { useStudy } from './studyStore';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await installPack(
    {
      format: 'lllm-study-pack',
      version: 1,
      id: 'p',
      title: 'P',
      items: Array.from({ length: 3 }, (_, i) => ({
        id: `w${i}`,
        type: 'vocab' as const,
        term: `word${i}`,
        meanings: ['意味'],
      })),
    },
    'import',
  );
  useStudy.getState().end();
});

describe('studyStore', () => {
  it('評価を連打しても、同じカードの記録は 1 件だけ保存する', async () => {
    await useStudy.getState().start();
    const first = useStudy.getState().current!.card.id;
    useStudy.getState().reveal();
    await Promise.all([useStudy.getState().rate(3), useStudy.getState().rate(3)]);
    const reviews = await db.reviews.toArray();
    expect(reviews.filter((r) => r.cardId === first)).toHaveLength(1);
    expect(useStudy.getState().stats.done).toBe(1);
  });

  it('おさらいは記録を残さない', async () => {
    await useStudy.getState().start();
    useStudy.getState().reveal();
    await useStudy.getState().rate(1);
    await useStudy.getState().startPractice('mistakes');
    expect(useStudy.getState().mode).toBe('practice');
    useStudy.getState().reveal();
    await useStudy.getState().rate(1);
    await useStudy.getState().rate(3);
    expect(await db.reviews.count()).toBe(1);
  });

  it('書いた答えを答え合わせして、評価のひとことに渡す', async () => {
    await useStudy.getState().start();
    const { current, shownAt } = useStudy.getState();
    const expected = expectedAnswer(current!.item.item, current!.card.template);
    const text = expected && 'accepted' in expected ? expected.accepted[0] : '';
    useStudy.getState().submitAnswer(text);
    const st = useStudy.getState();
    expect(st.revealed).toBe(true);
    expect(st.answer).toMatchObject({ shownAt, text, verdict: 'correct' });
    await st.rate(3);
    expect(useStudy.getState().lastRating?.userAnswer).toEqual({ text, verdict: 'correct' });
    // 次のカードには持ち越さない
    expect(useStudy.getState().answer).toBeNull();
  });

  it('意味を答えるカードで一致しないときは、不正解と言い切らない', async () => {
    await useStudy.getState().start();
    const template = useStudy.getState().current!.card.template;
    useStudy.getState().submitAnswer('ぜんぜん違う答え');
    expect(useStudy.getState().answer?.verdict).toBe(template === 'recall' ? 'wrong' : null);
  });

  it('中断したら、自分で始めるまで中断したまま', async () => {
    await useStudy.getState().start();
    useStudy.getState().interrupt();
    expect(useStudy.getState()).toMatchObject({ status: 'idle', interrupted: true, current: null });
    await useStudy.getState().start();
    expect(useStudy.getState()).toMatchObject({ status: 'studying', interrupted: false });
  });
});
