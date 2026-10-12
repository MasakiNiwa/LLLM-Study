import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  CircleStop,
  Eye,
  EyeOff,
  House,
  Infinity as InfinityIcon,
  Library,
  Loader2,
  Layers,
  Play,
  PencilLine,
  PartyPopper,
  TriangleAlert,
  Undo2,
  Wand2,
} from 'lucide-react';
import { Link } from 'wouter';
import { PageHeader } from '@/app/PageHeader';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import type { GradeValue } from '@/lib/db/types';
import {
  answersInTargetLanguage,
  expectedAnswer,
  speakText,
  speakTiming,
} from '@/lib/packs/itemText';
import type { AnswerVerdict } from '@/lib/srs/answerCheck';
import { speak, stopSpeaking } from '@/lib/speech/tts';
import { formatClock } from '@/lib/utils/format';
import { getPersona } from '@/features/ai/personas';
import { CardFace } from '@/features/items/ItemCard';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings } from '@/features/settings/settingsStore';
import { AiAssistPanel } from '@/features/study/AiAssistPanel';
import { LEECH_LAPSES } from '@/features/study/cardActions';
import { AnswerInput } from '@/features/study/AnswerInput';
import { AnswerResult } from '@/features/study/AnswerResult';
import { AnswerSheet } from '@/features/study/AnswerSheet';
import { PracticePicker } from '@/features/study/PracticePicker';
import { StudyDisplayMenu } from '@/features/study/StudyDisplayMenu';
import { StudyTimerMenu } from '@/features/study/StudyTimerMenu';
import { CardInfoButton } from '@/features/study/CardInfoSheet';
import { useStudyLayout } from '@/features/study/useStudyLayout';
import { RatingBar } from '@/features/study/RatingBar';
import { ScopePicker } from '@/features/study/ScopePicker';
import { RevealReaction } from '@/features/study/RevealReaction';
import { StudyTimers } from '@/features/study/StudyTimers';
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
  const practice = useStudy((s) => s.mode === 'practice');
  const timeUp = useStudy((s) => s.timeUp);
  const canUndo = useStudy((s) => s.undoStack.length > 0);
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
          {timeUp
            ? '⏰ 時間になりました'
            : practice
              ? stats.done > 0
                ? 'おさらいが終わりました'
                : 'おさらいするカードがありません'
              : stats.done > 0
                ? '今日の学習が終わりました'
                : '今は学習するカードがありません'}
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
            <div className="text-xs text-slate-500" title="自分で「正解」「簡単」にした割合">
              正解・簡単（自己評価）
            </div>
          </div>
          <div>
            <div className="text-2xl font-bold tabular-nums">
              {formatClock(endedAt - stats.startedAt)}
            </div>
            <div className="text-xs text-slate-500">時間</div>
          </div>
        </Card>
      )}
      {canUndo && (
        <Button variant="ghost" size="sm" onClick={() => void useStudy.getState().undo()}>
          <Undo2 />
          最後の評価を取り消す
        </Button>
      )}
      {timeUp && !practice && (
        <Button variant="primary" size="sm" onClick={() => void useStudy.getState().start()}>
          <Play />
          続きを学習する（時間を測り直す）
        </Button>
      )}
      {practice ? (
        <Button variant="secondary" size="sm" onClick={() => void useStudy.getState().start()}>
          今日の学習に戻る
        </Button>
      ) : (
        <ScopePicker />
      )}
      {!unlimited && !practice && (
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
      <PracticePicker key={`${practice}:${stats.done}`} stacked />
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
  const practice = useStudy((s) => s.mode === 'practice');
  const { compact, zoom } = useStudyLayout();
  const { start, reveal, rate, undo, interrupt, submitAnswer, setAnswerVerdict } =
    useStudy.getState();
  const interrupted = useStudy((s) => s.interrupted);
  const autoSpeak = useSettings((s) => s.autoSpeak);
  const speechRate = useSettings((s) => s.speechRate);
  const speechVoice = useSettings((s) => s.speechVoice);
  const shownAt = useStudy((s) => s.shownAt);
  // 同じカードがもう一度出たとき（おさらい・学習中のステップ）に前の答えを持ち越さないよう、
  // 回答の状態は「カード + 表示した時刻」ごとに持つ（画面を移っても保つよう store に置く）
  const showKey = current ? `${current.card.id}:${shownAt}` : '';
  const stored = useStudy((s) => s.response);
  const response = stored && stored.shownAt === shownAt ? stored : null;
  const ordered = response?.order;
  const chosen = response?.choice;
  const timedOutNow = !!response?.timedOut;
  const typeAnswer = useSettings((s) => s.typeAnswer);
  // 書いた答えと答え合わせの結果（今表示しているカードのものだけ使う）
  const written = useStudy((s) => s.answer);
  const typedNow = written && written.shownAt === shownAt ? written : null;
  const [answerOpen, setAnswerOpen] = useState(false);
  // テストモードの時間切れ: 答えを表示する（書きかけの答えのシートは閉じる）
  const onCardTimeUp = useCallback(() => {
    setAnswerOpen(false);
    useStudy.getState().timeOut();
  }, []);

  // ページを開いたら今日のキューで始める（自分で中断したときは、始めるボタンを押すまで待つ）
  useEffect(() => {
    const st = useStudy.getState();
    if ((st.status === 'idle' && !st.interrupted) || st.status === 'done') void st.start();
  }, []);

  // カードを表示したら（同じカードの再表示も含む）、設定に応じて読み上げる。
  // 読むと答えが分かってしまうもの（穴埋め・並べ替え・単語を答えるカード）は答えを見たあとに読む
  useEffect(() => {
    const cur = useStudy.getState().current;
    const text = cur && speakText(cur.item.item);
    // 聞き取りカードは設定に関係なく、表示したら音声を流す
    const listen = cur?.card.template === 'listen';
    const front = cur && speakTiming(cur.item.item, cur.card.template) === 'front';
    if (cur && text && (listen || (autoSpeak && front))) {
      // 設定で選ぶ声は英語用なので、ほかの言語の教材では端末の既定の声を使う
      const voiceURI = cur.lang.startsWith('en') ? speechVoice || undefined : undefined;
      void speak(text, { lang: cur.lang, rate: speechRate, voiceURI });
    }
    return () => stopSpeaking();
  }, [showKey, autoSpeak, speechRate, speechVoice]);

  useEffect(() => {
    if (!revealed || !autoSpeak) return;
    const cur = useStudy.getState().current;
    const text = cur && speakText(cur.item.item);
    if (!cur || !text || cur.card.template === 'listen') return;
    if (speakTiming(cur.item.item, cur.card.template) !== 'back') return;
    const voiceURI = cur.lang.startsWith('en') ? speechVoice || undefined : undefined;
    void speak(text, { lang: cur.lang, rate: speechRate, voiceURI });
    // 止めるのはカードが変わったとき（上の effect の後片付け）
  }, [revealed, showKey, autoSpeak, speechRate, speechVoice]);

  const isChoice = current?.item.item.type === 'choice';
  const isOrder = current?.item.item.type === 'order';
  const expected = current ? expectedAnswer(current.item.item, current.card.template) : undefined;
  const shouldType =
    !!current &&
    !!expected &&
    typeAnswer !== 'off' &&
    (typeAnswer === 'all' || answersInTargetLanguage(current.item.item, current.card.template));
  const recommended: GradeValue | undefined = timedOutNow
    ? 1
    : isChoice && chosen !== undefined && current?.item.item.type === 'choice'
      ? chosen === current.item.item.answer
        ? 3
        : 1
      : ordered
        ? ordered.correct
          ? 3
          : 1
        : typedNow?.verdict
          ? VERDICT_GRADE[typedNow.verdict]
          : // 選択・並べ替えを「わからない」で答えを見たとき
            revealed && (isChoice || isOrder)
            ? 1
            : undefined;

  // キーボード操作: Space / Enter で答えを見る、1〜4 で評価、Ctrl+Z で取り消し
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable]')) return;
      // シートやダイアログを開いているあいだは、評価のキーを受け付けない
      if (document.querySelector('dialog[open]')) return;
      const st = useStudy.getState();
      // 取り消しは、最後のカードを評価して終わった画面でも使える
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (st.undoStack.length === 0) return;
        e.preventDefault();
        void st.undo();
        return;
      }
      if (!st.current) return;
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
        title={practice ? 'おさらい' : '学習'}
        hideTitleOnMobile={status === 'studying'}
        hideHelp
        meta={
          status === 'studying' && (
            <span className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-sm whitespace-nowrap text-slate-500 tabular-nums">
                {practice && <span className="mr-1 font-sans sm:hidden">おさらい</span>}
                残り {queueLength}
              </span>
              <StudyTimers onCardTimeUp={onCardTimeUp} />
            </span>
          )
        }
        actions={
          <>
            {(status === 'studying' || (status === 'done' && canUndo)) && (
              <>
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
              </>
            )}
            <StudyTimerMenu />
            <StudyDisplayMenu />
          </>
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
            <div
              className={cn(
                'mx-auto w-full max-w-2xl px-3 sm:px-4',
                compact ? 'space-y-2 py-2' : 'space-y-4 py-4 sm:py-6',
              )}
            >
              <div className="flex items-center gap-2">
                {practice ? (
                  <p className="min-w-0 flex-1 text-xs text-accent-800 dark:text-accent-200">
                    おさらい中（評価は記録されません）
                  </p>
                ) : (
                  <ScopePicker className="min-w-0 shrink" />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto shrink-0 text-slate-600 dark:text-slate-300"
                  onClick={interrupt}
                  title="今の学習をやめます。ここまでの評価は記録に残ります"
                >
                  <CircleStop />
                  {practice ? 'おさらいをやめる' : '学習を中断'}
                </Button>
              </div>
              {practice && !compact && (
                <p className="rounded-xl bg-accent-50 px-3 py-2 text-xs text-accent-900 dark:bg-accent-900/20 dark:text-accent-200">
                  評価は記録されず、復習の予定も変わりません。思い出せなかったカードは少しあとにもう一度出ます。
                </p>
              )}
              <Card className="relative overflow-hidden">
                <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">
                  {badge && (
                    <span className={`rounded-md px-1.5 py-0.5 font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  )}
                  {current.card.reps > 0 && <span>復習 {current.card.reps} 回</span>}
                  {current.card.lapses > 0 && <span>忘れた回数 {current.card.lapses}</span>}
                  {timedOutNow && (
                    <span className="rounded-md bg-rose-100 px-1.5 py-0.5 font-medium text-rose-800 dark:bg-rose-900/40 dark:text-rose-200">
                      時間切れ
                    </span>
                  )}
                  <span className="ml-auto" />
                  <CardInfoButton card={current.card} item={current.item} revealed={revealed} />
                  <button
                    type="button"
                    onClick={() => void useStudy.getState().suspendCurrent()}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                    title="この項目を今後出題しない（教材の項目一覧から再開できます）"
                  >
                    <EyeOff className="size-3.5" />
                    出題しない
                  </button>
                </div>
                <div
                  className={compact ? 'px-3 py-4 sm:px-6 sm:py-5' : 'px-4 py-8 sm:px-8 sm:py-10'}
                  // 文字の大きさの設定に合わせてカードの中身を拡大・縮小する
                  style={zoom !== 1 ? { zoom } : undefined}
                  key={showKey}
                >
                  <CardFace
                    record={current.item}
                    template={current.card.template}
                    lang={current.lang}
                    side="front"
                    chosen={chosen}
                    onChoose={useStudy.getState().choose}
                    ordered={ordered}
                    seed={`${current.card.id}:${current.card.reps}`}
                    onOrder={useStudy.getState().submitOrder}
                    locked={revealed}
                  />
                  {shouldType && !revealed && expected && (
                    <AnswerInput
                      targetLanguage={answersInTargetLanguage(
                        current.item.item,
                        current.card.template,
                      )}
                      lang={current.lang}
                      blanks={'blanks' in expected ? expected.blanks.length : undefined}
                      onSubmit={submitAnswer}
                    />
                  )}
                  {revealed && typedNow && (
                    <AnswerResult
                      card={current.card}
                      answer={typedNow.text}
                      check={typedNow.check}
                      verdict={typedNow.verdict}
                      onJudged={(verdict) => setAnswerVerdict(verdict, typedNow.shownAt)}
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
              {/* 答えを見て解説を読んでいるあいだに出すひとこと（次のカードへ進んだら出さない） */}
              <RevealReaction />
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
              {revealed && <AiAssistPanel key={showKey} card={current.card} />}
            </div>
          </div>
          <div className="pb-safe relative shrink-0 border-t border-slate-200 bg-slate-50/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90">
            <div
              className={cn(
                'mx-auto w-full max-w-2xl px-3 sm:px-4',
                compact ? 'py-2' : 'space-y-2 py-3',
              )}
            >
              {revealed ? (
                <RatingBar
                  card={current.card}
                  now={shownAt}
                  onRate={(g) => void rate(g)}
                  recommended={recommended}
                  practice={practice}
                  compact={compact}
                />
              ) : isChoice || isOrder ? (
                <div className={cn('flex items-center gap-2', compact ? 'h-12' : 'h-14')}>
                  <p className="min-w-0 flex-1 text-center text-sm text-slate-500">
                    {isChoice ? '答えを選んでください' : '語句を正しい順に並べてください'}
                  </p>
                  <Button
                    variant="secondary"
                    size="lg"
                    className={cn('shrink-0 px-4 text-base', compact ? 'h-12' : 'h-14')}
                    onClick={reveal}
                  >
                    <Eye />
                    わからない
                  </Button>
                </div>
              ) : shouldType ? (
                <Button
                  variant="secondary"
                  size="lg"
                  className={cn('w-full text-base', compact ? 'h-12' : 'h-14')}
                  onClick={reveal}
                >
                  <Eye />
                  わからない・答えを見る
                </Button>
              ) : (
                <div className="flex gap-2">
                  {expected && (
                    <Button
                      variant="secondary"
                      size="lg"
                      className={cn('shrink-0 px-4 text-base', compact ? 'h-12' : 'h-14')}
                      onClick={() => setAnswerOpen(true)}
                    >
                      <PencilLine />
                      答えを書く
                    </Button>
                  )}
                  <Button
                    variant="primary"
                    size="lg"
                    className={cn('min-w-0 flex-1 text-base', compact ? 'h-12' : 'h-14')}
                    onClick={reveal}
                  >
                    <Eye />
                    答えを見る
                  </Button>
                </div>
              )}
            </div>
          </div>
          <AnswerSheet
            key={showKey}
            open={answerOpen}
            onClose={() => setAnswerOpen(false)}
            item={current.item.item}
            template={current.card.template}
            lang={current.lang}
            onSubmit={submitAnswer}
          />
        </>
      )}
      {status === 'idle' && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-10 text-center">
            <div className="flex size-14 items-center justify-center rounded-full bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-300">
              <Layers className="size-7" />
            </div>
            <div>
              <h2 className="text-lg font-bold">
                {interrupted ? '学習を中断しました' : '学習を始めましょう'}
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {interrupted
                  ? 'ここまでの評価は記録に残っています。続きは「学習を始める」から（今日の分を読み直します）'
                  : '今日の分を読み直してから始めます'}
              </p>
            </div>
            <ScopePicker />
            <Button variant="primary" size="lg" className="w-full" onClick={() => void start()}>
              <Play />
              学習を始める
            </Button>
            <PracticePicker stacked />
          </div>
        </div>
      )}
    </>
  );
}
