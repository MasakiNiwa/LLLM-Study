import { beforeEach, describe, expect, it, vi } from 'vitest';

const runOneshot = vi.fn();
const cancelAi = vi.fn();
vi.mock('@/features/ai/oneshot', () => ({ runOneshot, cancelAi }));

const { useAssistThread } = await import('./assistThread');

beforeEach(() => {
  runOneshot.mockReset();
  useAssistThread.setState({ key: null, entries: [] });
});

describe('学習画面の AI とのやりとり', () => {
  it('質問を前のやりとりの下に続けて並べ、前のやりとりを踏まえて答えてもらう', async () => {
    const t = useAssistThread.getState();
    t.open('card1:1');
    runOneshot.mockResolvedValueOnce({ text: '解説です', cancelled: false });
    await t.ask('card1:1', '解説して', 'PROMPT1');
    runOneshot.mockResolvedValueOnce({ text: '例文です', cancelled: false });
    await t.ask('card1:1', '例文を作って', 'PROMPT2');
    expect(useAssistThread.getState().entries.map((e) => [e.question, e.text, e.status])).toEqual([
      ['解説して', '解説です', 'done'],
      ['例文を作って', '例文です', 'done'],
    ]);
    // 2 回目は 1 回目のやりとりを履歴として渡す
    expect(runOneshot.mock.calls[1][0].history.map((h: { text: string }) => h.text)).toEqual([
      '解説して',
      '解説です',
    ]);
  });

  it('同じ表示に戻ってきたときは残し、次のカードに進んだら消す', async () => {
    const t = useAssistThread.getState();
    t.open('card1:1');
    runOneshot.mockResolvedValueOnce({ text: '解説です', cancelled: false });
    await t.ask('card1:1', '解説して', 'P');
    t.open('card1:1');
    expect(useAssistThread.getState().entries).toHaveLength(1);
    t.open('card2:2');
    expect(useAssistThread.getState().entries).toHaveLength(0);
  });

  it('次のカードに進んだあとに届いた応答は、前のカードのやりとりに入れない', async () => {
    const t = useAssistThread.getState();
    t.open('card1:1');
    let resolve!: (v: unknown) => void;
    runOneshot.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const p = t.ask('card1:1', '解説して', 'P');
    t.open('card2:2');
    resolve({ text: '遅れて届いた', cancelled: false });
    await p;
    expect(useAssistThread.getState()).toMatchObject({ key: 'card2:2', entries: [] });
  });
});
