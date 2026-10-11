import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db/db';
import { installPack } from '@/lib/packs/install';
import { DEFAULT_SETTINGS } from '@/features/settings/settingsStore';
import { saveRating } from '@/features/study/repository';
import { pickQuizItems } from './quizSelect';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await installPack(
    {
      format: 'lllm-study-pack',
      version: 1,
      id: 'p',
      title: 'P',
      items: [
        { id: 'a', type: 'vocab', term: 'apple', meanings: ['りんご'] },
        { id: 'b', type: 'vocab', term: 'banana', meanings: ['バナナ'] },
        { id: 'q', type: 'qa', question: 'Q', answer: 'A' },
      ],
    },
    'import',
  );
});

describe('pickQuizItems', () => {
  it('学習済みで思い出しにくいものを先に、問題文に使えない種類は除く', async () => {
    const now = Date.now();
    const b = (await db.cards.get('p/b#recognize'))!;
    await saveRating(b, 1, 1000, DEFAULT_SETTINGS, now - 3 * 86_400_000);
    const picks = await pickQuizItems(5, now);
    expect(picks.map((p) => p.itemKey)).toEqual(['p/b', 'p/a']);
  });
});
