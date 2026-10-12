/**
 * 教材の変更・非同期の処理と、学習中のセッションの整合（レビューで見つかった不具合の回帰テスト）。
 */
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import {
  installPack,
  resetPackProgress,
  setPackTemplates,
  uninstallPack,
} from '@/lib/packs/install';
import { DEFAULT_SETTINGS, useSettings } from '@/features/settings/settingsStore';
import { setItemSuspended } from './cardActions';
import { revealOutcome, useStudy } from './studyStore';

const pack = {
  format: 'lllm-study-pack' as const,
  version: 1 as const,
  id: 'review-test',
  title: 'Review test',
  items: [0, 1, 2].map((i) => ({
    id: String(i),
    type: 'qa' as const,
    question: `Q${i}`,
    answer: `A${i}`,
  })),
};

beforeEach(async () => {
  useStudy.getState().end();
  useSettings.setState({ ...DEFAULT_SETTINGS, fuzz: false });
  await db.delete();
  await db.open();
  await installPack(pack, 'import');
});

describe('教材の変更と学習中のセッション', () => {
  it('学習中に教材を削除すると、セッションを終え、評価してもカードを復活させない', async () => {
    await useStudy.getState().start();
    const id = useStudy.getState().current!.card.id;
    const stale = useStudy.getState().current!;
    await uninstallPack(pack.id);
    expect(useStudy.getState().status).toBe('idle');
    expect(useStudy.getState().interrupted).toBe(false);
    // 古い画面の状態のまま評価しようとしても、保存しない
    useStudy.setState({ status: 'studying', current: stale, revealed: true });
    await useStudy.getState().rate(4);
    expect(await db.packs.count()).toBe(0);
    expect(await db.cards.get(id)).toBeUndefined();
    expect(await db.reviews.count()).toBe(0);
  });

  it('進捗をリセットしたら、リセット前のカードを持ったセッションを終える', async () => {
    await useStudy.getState().start();
    await useStudy.getState().rate(1);
    await useStudy.getState().startPractice('mistakes');
    expect(useStudy.getState().current!.card.reps).toBe(1);
    await resetPackProgress(pack.id);
    expect(useStudy.getState().status).toBe('idle');
    await useStudy.getState().start();
    expect(useStudy.getState().current!.card.reps).toBe(0);
  });

  it('教材を更新したら、始め直すと新しい答えが出る', async () => {
    await useStudy.getState().start();
    await installPack(
      { ...pack, items: pack.items.map((i) => ({ ...i, answer: 'CORRECTED' })) },
      'import',
    );
    expect(useStudy.getState().status).toBe('idle');
    await useStudy.getState().start();
    expect(useStudy.getState().current!.item.item).toHaveProperty('answer', 'CORRECTED');
  });

  it('ほかの教材の変更では、学習を終えない', async () => {
    await installPack({ ...pack, id: 'other' }, 'import');
    useSettings.setState({ focusPackId: pack.id });
    await useStudy.getState().start();
    await uninstallPack('other');
    expect(useStudy.getState().status).toBe('studying');
  });

  it('評価の保存中に中断したら、保存は残し、学習画面は中断のまま', async () => {
    await useStudy.getState().start();
    useStudy.getState().reveal();
    const pending = useStudy.getState().rate(4);
    useStudy.getState().interrupt();
    expect(useStudy.getState().status).toBe('idle');
    await pending;
    expect(useStudy.getState()).toMatchObject({ status: 'idle', interrupted: true });
    expect(await db.reviews.count()).toBe(1);
  });
});

describe('カードの型を外す', () => {
  it('外した型のカードは記録を残したまま休止し、戻すと再開する', async () => {
    const vocab = {
      format: 'lllm-study-pack' as const,
      version: 1 as const,
      id: 'v',
      title: 'V',
      items: [{ id: 'w', type: 'vocab' as const, term: 'take', meanings: ['取る'] }],
    };
    await installPack(vocab, 'import');
    await setPackTemplates('v', { vocab: ['recognize', 'recall'] });
    useSettings.setState({ focusPackId: 'v' });
    await useStudy.getState().start();
    // recall のカードを評価して記録を作る
    while (useStudy.getState().current?.card.template !== 'recall') {
      await useStudy.getState().rate(3);
    }
    await useStudy.getState().rate(3);
    const recallId = 'v/w#recall';
    expect(await db.reviews.where('cardId').equals(recallId).count()).toBe(1);

    await setPackTemplates('v', { vocab: ['recognize'] });
    expect((await db.cards.get(recallId))?.suspended).toBe(2);
    expect(await db.reviews.where('cardId').equals(recallId).count()).toBe(1);
    // 項目の出題停止・再開でも、休止中のカードは戻らない
    await setItemSuspended('v/w', true);
    await setItemSuspended('v/w', false);
    expect((await db.cards.get(recallId))?.suspended).toBe(2);

    await setPackTemplates('v', { vocab: ['recognize', 'recall'] });
    const back = await db.cards.get(recallId);
    expect(back?.suspended).toBe(0);
    expect(back?.reps).toBe(1);
  });
});

describe('出題ごとの状態', () => {
  it('遅れて返ってきた AI の判定は、次のカードの答えを書き換えない', async () => {
    await useStudy.getState().start();
    useStudy.getState().submitAnswer('first answer');
    const firstShownAt = useStudy.getState().shownAt;
    await new Promise((r) => setTimeout(r, 2));
    await useStudy.getState().rate(4);
    useStudy.getState().submitAnswer('second answer');
    useStudy.getState().setAnswerVerdict('correct', firstShownAt);
    expect(useStudy.getState().answer).toMatchObject({ text: 'second answer', verdict: null });
  });

  it('時間切れ・選んだ答えは store に残り、答えを見たあとは選び直せない', async () => {
    await useStudy.getState().start();
    useStudy.getState().timeOut();
    const { response, revealed, shownAt } = useStudy.getState();
    expect(revealed).toBe(true);
    expect(response).toEqual({ shownAt, timedOut: true });
    useStudy.getState().choose(1);
    expect(useStudy.getState().response).toEqual({ shownAt, timedOut: true });
  });

  it('最後のカードを評価して終わったあとも、取り消して戻れる', async () => {
    useSettings.setState({ newPerDay: 1 });
    await useStudy.getState().start();
    useStudy.getState().reveal();
    await useStudy.getState().rate(4);
    expect(useStudy.getState().status).toBe('done');
    await useStudy.getState().undo();
    expect(useStudy.getState().status).toBe('studying');
    expect(await db.reviews.count()).toBe(0);
  });
});

describe('答えを見たときの結果（ひとことの出し分け）', () => {
  it('時間切れ・書いた答えの判定・自分で答え合わせを見分ける', async () => {
    await useStudy.getState().start();
    useStudy.getState().reveal();
    expect(revealOutcome(useStudy.getState())).toBe('self');
    await useStudy.getState().rate(3);
    useStudy.getState().timeOut();
    expect(revealOutcome(useStudy.getState())).toBe('timeout');
    await useStudy.getState().rate(1);
    const { current } = useStudy.getState();
    useStudy
      .getState()
      .submitAnswer(current!.item.item.type === 'qa' ? current!.item.item.answer : 'x');
    expect(revealOutcome(useStudy.getState())).toBe('correct');
  });
});
