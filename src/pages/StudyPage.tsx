import { useEffect, useState } from 'react';
import {
  CalendarDays,
  Eye,
  EyeOff,
  House,
  Infinity as InfinityIcon,
  Keyboard,
  Library,
  Loader2,
  LogOut,
  PartyPopper,
  TriangleAlert,
  Undo2,
  Wand2,
} from 'lucide-react';
import { Link } from 'wouter';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import type { GradeValue } from '@/lib/db/types';
import { answersInTargetLanguage, expectedAnswer, speakText } from '@/lib/packs/itemText';
import { checkAnswer, type AnswerCheck, type AnswerVerdict } from '@/lib/srs/answerCheck';
import { speak, stopSpeaking } from '@/lib/speech/tts';
import { formatDuration } from '@/lib/utils/format';
import { getPersona } from '@/features/ai/personas';
import { CardFace, type OrderResult } from '@/features/items/ItemCard';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings } from '@/features/settings/settingsStore';
import { AiAssistPanel } from '@/features/study/AiAssistPanel';
import { LEECH_LAPSES } from '@/features/study/cardActions';
import { AnswerInput } from '@/features/study/AnswerInput';
import { AnswerResult } from '@/features/study/AnswerResult';
import { RatingBar } from '@/features/study/RatingBar';
import { ScopePicker } from '@/features/study/ScopePicker';
import { ReactionBubble } from '@/features/study/ReactionBubble';
import { useStudy } from '@/features/study/studyStore';

const VERDICT_GRADE: Record<AnswerVerdict, GradeValue> = { correct: 3, close: 2, wrong: 1 };

const STATE_BADGE = {
  0: { label: '新規', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' },
  1: {
    label: '学習中',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  },
  2: {
    label: '復習',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  },
  3: {
    label: '再学習',
    className: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  },
} as const;

function SessionSummary() {
  const stats = useStudy((s) => s.stats);
  const personaId = useSettings((s) => s.persona);
  const custom = useSettings((s) => s.customPersona);
  const persona = getPersona(personaId, custom);
  const aiReady = useEngine((s) => s.status === 'ready');
  const unlimited = useSettings((s) => s.noDailyLimit);
  const [endedAt] = useState(() => Date.now());
  const [message] = useState(() => {
    const list = stats.done > 0 ? persona.finish : persona.allDone;
    return list[Math.floor(Math.random() * list.length)];
  });
  const correct = stats.ratings[3] + stats.ratings[4];
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-5 px-4 py-10 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-300">
        <PartyPopper className="size-8" />
      </div>
      <div>
        <h2 className="text-xl font-bold">
          {stats.done > 0 ? '今日の学習が終わりました' : '今は学習するカードがありません'}
        </h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          <span className="mr-1" aria-hidden>
            {persona.emoji}
          </span>
          {message}
        </p>
      </div>
      {stats.done > 0 && (
        <Card className="grid w-full grid-cols-3 divide-x divide-slate-100 py-3 dark:divide-slate-800">
          <div>
            <div className="text-2xl font-bold tabular-nums">{stats.done}</div>
            <div className="text-xs text-slate-500">枚</div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums">
              {Math.round((correct / stats.done) * 100)}%
            </div>
            <div className="text-xs text-slate-500">正解率</div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums">
              {formatDuration(endedAt - stats.startedAt).replace(' 秒', '秒')}
            </div>
            <div className="text-xs text-slate-500">時間</div>
          </div>
        </Card>
      )}
      <ScopePicker />
      {!unlimited && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            useSettings.getState().update({ noDailyLimit: true });
            void useStudy.getState().start();
          }}
        >
          <InfinityIcon />
          上限なしで続ける
        </Button>
      )}
      <div className="flex flex-wrap justify-center gap-2">
        {aiReady && stats.done > 0 && (
          <Link href="/quiz">
            <Button variant="secondary">
              <Wand2 />
              AI 例文クイズ
            </Button>
          </Link>
        )}
        {stats.done === 0 && (
          <Link href="/library">
            <Button variant="secondary">
              <Library />
              教材を見る
            </Button>
          </Link>
        )}
        <Link href="/">
          <Button variant="secondary">
            <House />
            ホームへ
          </Button>
        </Link>
        <Link href="/calendar">
          <Button variant="primary">
            <CalendarDays />
            カレンダーを見る
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function StudyPage() {
  const status = useStudy((s) => s.status);
  const current = useStudy((s) => s.current);
  const revealed = useStudy((s) => s.revealed);
  const queueLength = useStudy((s) => s.queue.length);
  const stats = useStudy((s) => s.stats);
  const canUndo = useStudy((s) => s.undoStack.length > 0);
  const { start, reveal, rate, undo, end } = useStudy.getState();
  const autoSpeak = useSettings((s) => s.autoSpeak);
  const speechRate = useSettings((s) => s.speechRate);
  const speechVoice = useSettings((s) => s.speechVoice);
  // 選択問題で選んだ番号（カードごと）
  const [choice, setChoice] = useState<{ cardId: string; index: number } | null>(null);
  // 並べ替えの結果（カードごと）
  const [order, setOrder] = useState<{ cardId: string; result: OrderResult } | null>(null);
  const ordered = order && order.cardId === current?.card.id ? order.result : undefined;
  const chosen = choice && choice.cardId === current?.card.id ? choice.index : undefined;
  const shownAt = useStudy((s) => s.shownAt);
  const typeAnswer = useSettings((s) => s.typeAnswer);
  const updateSettings = useSettings((s) => s.update);
  // 入力した答えと答え合わせの結果（カードごと）
  const [typed, setTyped] = useState<{
    cardId: string;
    answer: string;
    check: AnswerCheck;
    verdict: AnswerVerdict;
  } | null>(null);
  const typedNow = typed && typed.cardId === current?.card.id ? typed : null;

  // ページを開いたら今日のキューで始める
  useEffect(() => {
    const st = useStudy.getState().status;
    if (st === 'idle' || st === 'done') void useStudy.getState().start();
  }, []);

  // カードが変わったら、設定に応じて読み上げる
  const cardId = current?.card.id;
  useEffect(() => {
    const cur = useStudy.getState().current;
    const text = cur && speakText(cur.item.item);
    // 聞き取りカードは設定に関係なく、表示したら音声を流す
    const listen = cur?.card.template === 'listen';
    if (cur && text && (listen || (autoSpeak && cur.card.template !== 'recall'))) {
      // 設定で選ぶ声は英語用なので、ほかの言語の教材では端末の既定の声を使う
      const voiceURI = cur.lang.startsWith('en') ? speechVoice || undefined : undefined;
      void speak(text, { lang: cur.lang, rate: speechRate, voiceURI });
    }
    return () => stopSpeaking();
  }, [cardId, autoSpeak, speechRate, speechVoice]);

  const isChoice = current?.item.item.type === 'choice';
  const isOrder = current?.item.item.type === 'order';
  const expected = current ? expectedAnswer(current.item.item, current.card.template) : undefined;
  const shouldType =
    !!current &&
    !!expected &&
    typeAnswer !== 'off' &&
    (typeAnswer === 'all' || answersInTargetLanguage(current.item.item, current.card.template));
  const recommended: GradeValue | undefined =
    isChoice && chosen !== undefined && current?.item.item.type === 'choice'
      ? chosen === current.item.item.answer
        ? 3
        : 1
      : ordered
        ? ordered.correct
          ? 3
          : 1
        : typedNow
          ? VERDICT_GRADE[typedNow.verdict]
          : undefined;

  // キーボード操作: Space / Enter で答えを見る、1〜4 で評価、Ctrl+Z で取り消し
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      const st = useStudy.getState();
      if (!st.current) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        void st.undo();
        return;
      }
      if (!st.revealed && (e.key === ' ' || e.key === 'Enter')) {
        if (st.current.item.item.type === 'choice' || st.current.item.item.type === 'order') return;
        e.preventDefault();
        st.reveal();
        return;
      }
      if (st.revealed && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        void st.rate(Number(e.key) as GradeValue);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const total = stats.done + queueLength;
  const badge = current ? STATE_BADGE[current.card.state] : null;

  return (
    <>
      <PageHeader
        title="学習"
        meta={
          status === 'studying' && (
            <span className="font-mono text-sm text-slate-500 tabular-nums">
              残り {queueLength}
            </span>
          )
        }
        actions={
          status === 'studying' && (
            <>
              <Button
                size="icon"
                variant={typeAnswer !== 'off' ? 'secondary' : 'ghost'}
                onClick={() =>
                  updateSettings({ typeAnswer: typeAnswer === 'off' ? 'recall' : 'off' })
                }
                aria-pressed={typeAnswer !== 'off'}
                aria-label="答えを入力して答え合わせ"
                title={
                  typeAnswer !== 'off'
                    ? '答えの入力: オン（単語・フレーズを答えるカードと穴埋め）'
                    : '答えの入力: オフ'
                }
              >
                <Keyboard />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => void undo()}
                disabled={!canUndo}
                aria-label="直前の評価を取り消す"
                title="直前の評価を取り消す（Ctrl+Z）"
              >
                <Undo2 />
              </Button>
              <Link href="/">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="学習をやめる"
                  title="学習をやめる"
                  onClick={end}
                >
                  <LogOut />
                </Button>
              </Link>
            </>
          )
        }
      />
      {status === 'studying' && (
        <Progress value={total ? stats.done / total : 0} className="h-1 rounded-none" />
      )}

      {status === 'loading' && (
        <div className="flex flex-1 items-center justify-center text-slate-500">
          <Loader2 className="size-6 animate-spin" />
        </div>
      )}

      {status === 'done' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <SessionSummary />
        </div>
      )}

      {status === 'studying' && current && (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl space-y-4 px-3 py-4 sm:px-4 sm:py-6">
              <ScopePicker />
              <Card className="relative overflow-hidden">
                <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">
                  {badge && (
                    <span className={`rounded-md px-1.5 py-0.5 font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  )}
                  {current.card.reps > 0 && <span>復習 {current.card.reps} 回</span>}
                  {current.card.lapses > 0 && <span>忘れた回数 {current.card.lapses}</span>}
                  <button
                    type="button"
                    onClick={() => void useStudy.getState().suspendCurrent()}
                    className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    title="この項目を今後出題しない（教材の項目一覧から再開できます）"
                  >
                    <EyeOff className="size-3.5" />
                    出題しない
                  </button>
                </div>
                <div className="px-4 py-8 sm:px-8 sm:py-10" key={current.card.id}>
                  <CardFace
                    record={current.item}
                    template={current.card.template}
                    lang={current.lang}
                    side="front"
                    chosen={chosen}
                    onChoose={(index) => {
                      setChoice({ cardId: current.card.id, index });
                      reveal();
                    }}
                    ordered={ordered}
                    seed={`${current.card.id}:${current.card.reps}`}
                    onOrder={(result) => {
                      setOrder({ cardId: current.card.id, result });
                      reveal();
                    }}
                  />
                  {shouldType && !revealed && expected && (
                    <AnswerInput
                      targetLanguage={answersInTargetLanguage(
                        current.item.item,
                        current.card.template,
                      )}
                      lang={current.lang}
                      blanks={'blanks' in expected ? expected.blanks.length : undefined}
                      onSubmit={(answer) => {
                        const check = checkAnswer(answer, expected);
                        setTyped({
                          cardId: current.card.id,
                          answer,
                          check,
                          verdict: check.verdict,
                        });
                        reveal();
                      }}
                    />
                  )}
                  {revealed && typedNow && (
                    <AnswerResult
                      card={current.card}
                      answer={typedNow.answer}
                      check={typedNow.check}
                      onJudged={(verdict) => setTyped({ ...typedNow, verdict })}
                    />
                  )}
                  {revealed && (
                    <div className="mt-6 animate-fade-in border-t border-dashed border-slate-200 pt-6 dark:border-slate-700">
                      <CardFace
                        record={current.item}
                        template={current.card.template}
                        lang={current.lang}
                        side="back"
                        chosen={chosen}
                      />
                    </div>
                  )}
                </div>
              </Card>
              {revealed && current.card.lapses >= LEECH_LAPSES && (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                  <TriangleAlert className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    このカードは {current.card.lapses}{' '}
                    回忘れています。覚え方を変えてみるか、いったん出題を止めるのも手です。
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void useStudy.getState().suspendCurrent()}
                  >
                    出題を止める
                  </Button>
                </div>
              )}
              {revealed && <AiAssistPanel key={current.card.id} card={current.card} />}
            </div>
          </div>
          <div className="pb-safe shrink-0 border-t border-slate-200 bg-slate-50/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90">
            <div className="mx-auto w-full max-w-2xl space-y-2 px-3 py-3 sm:px-4">
              <div className="h-9">
                <ReactionBubble />
              </div>
              {revealed ? (
                <RatingBar
                  card={current.card}
                  now={shownAt}
                  onRate={(g) => void rate(g)}
                  recommended={recommended}
                />
              ) : isChoice || isOrder ? (
                <p className="flex h-14 items-center justify-center text-sm text-slate-500">
                  {isChoice ? '答えを選んでください' : '語句を正しい順に並べてください'}
                </p>
              ) : (
                <Button
                  variant={shouldType ? 'secondary' : 'primary'}
                  size="lg"
                  className="h-14 w-full text-base"
                  onClick={reveal}
                >
                  <Eye />
                  {shouldType ? 'わからない・答えを見る' : '答えを見る'}
                </Button>
              )}
            </div>
          </div>
        </>
      )}
      {status === 'idle' && (
        <div className="flex flex-1 items-center justify-center">
          <Button variant="primary" onClick={() => void start()}>
            学習を始める
          </Button>
        </div>
      )}
    </>
  );
}
