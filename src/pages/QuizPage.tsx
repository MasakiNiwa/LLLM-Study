import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Loader2, PartyPopper, RotateCcw, Sparkles, Wand2 } from 'lucide-react';
import { Link } from 'wouter';
import { PageBody, PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { checkAnswer, type AnswerCheck } from '@/lib/srs/answerCheck';
import { cn } from '@/lib/utils/cn';
import { errorMessage } from '@/lib/utils/format';
import { useAiBusy } from '@/features/ai/aiBusy';
import { cancelAi, runOneshot } from '@/features/ai/oneshot';
import { getPersona, reactionText } from '@/features/ai/personas';
import { useEngine } from '@/features/engine/engineStore';
import { parseQuiz, quizPrompt, type QuizQuestion } from '@/features/quiz/quizGen';
import { pickQuizItems, type QuizPick } from '@/features/quiz/quizSelect';
import { SpeakButton } from '@/features/items/ItemCard';
import { speechLang } from '@/lib/speech/lang';
import { useSettings } from '@/features/settings/settingsStore';

const COUNT = 5;
/** 1 問あたりの作り直しの上限（AI の出力が検証を通らないとき） */
const RETRIES = 2;

interface Answered {
  question: QuizQuestion;
  answer: string;
  check: AnswerCheck;
}

type Phase =
  { kind: 'intro' } | { kind: 'running' } | { kind: 'done' } | { kind: 'error'; message: string };

/** 1 問を作る（検証を通らなければ作り直す）。使えなければ null */
async function generate(pick: QuizPick): Promise<QuizQuestion | null> {
  for (let i = 0; i <= RETRIES; i++) {
    const r = await runOneshot({
      task: 'assist',
      prompt: quizPrompt(pick.item, pick.lang),
      plain: true,
      maxOutputTokens: 200,
    });
    if (r.cancelled) return null;
    const q = parseQuiz(r.text, pick.item, pick.itemKey);
    if (typeof q !== 'string') return { ...q, lang: pick.lang };
  }
  return null;
}

function Sentence({ text, answer }: { text: string; answer?: string }) {
  const [before, after] = text.split('___');
  return (
    <p className="text-center text-xl leading-relaxed font-medium sm:text-2xl">
      {before}
      {answer ? (
        <mark className="rounded-md bg-accent-100 px-1 text-accent-900 dark:bg-accent-900/50 dark:text-accent-100">
          {answer}
        </mark>
      ) : (
        <span className="mx-1 inline-block min-w-16 border-b-2 border-accent-500">&nbsp;</span>
      )}
      {after}
    </p>
  );
}

/**
 * AI 例文クイズ。項目はプログラムが選び、AI が作った問題をアプリが検証して出題し、採点もアプリが行う。
 * 練習なので、FSRS の復習予定には影響しない。
 */
export default function QuizPage() {
  const ready = useEngine((s) => s.status === 'ready');
  const engineStatus = useEngine((s) => s.status);
  const personaId = useSettings((s) => s.persona);
  const custom = useSettings((s) => s.customPersona);
  const persona = getPersona(personaId, custom);

  const [phase, setPhase] = useState<Phase>({ kind: 'intro' });
  const [question, setQuestion] = useState<QuizQuestion | null>(null);
  const [input, setInput] = useState('');
  const [current, setCurrent] = useState<Answered | null>(null);
  const [results, setResults] = useState<Answered[]>([]);
  const [reaction, setReaction] = useState('');
  /** 出題する問題数（作れなかった問題は減らす） */
  const [total, setTotal] = useState(0);
  const queue = useRef<QuizPick[]>([]);
  const running = useRef(false);

  // ページを離れたら生成を止める
  useEffect(
    () => () => {
      running.current = false;
      if (useAiBusy.getState().task === 'assist') cancelAi();
    },
    [],
  );

  const nextQuestion = async () => {
    setQuestion(null);
    setCurrent(null);
    setInput('');
    while (running.current) {
      const pick = queue.current.shift();
      if (!pick) {
        setPhase({ kind: 'done' });
        running.current = false;
        return;
      }
      try {
        const q = await generate(pick);
        if (!running.current) return;
        if (q) {
          setQuestion(q);
          return;
        }
        setTotal((t) => t - 1);
      } catch (e) {
        running.current = false;
        setPhase({ kind: 'error', message: errorMessage(e) });
        return;
      }
    }
  };

  const start = async () => {
    const picks = await pickQuizItems(COUNT);
    if (picks.length === 0) {
      setPhase({
        kind: 'error',
        message: '出題できる単語・フレーズがありません。先に教材を追加して学習してください',
      });
      return;
    }
    queue.current = picks;
    setTotal(picks.length);
    setResults([]);
    running.current = true;
    setPhase({ kind: 'running' });
    await nextQuestion();
  };

  const submit = () => {
    if (!question || current) return;
    const check = checkAnswer(input, { accepted: [question.answer, question.target] });
    const answered = { question, answer: input, check };
    setCurrent(answered);
    setResults((r) => [...r, answered]);
    const streak = [...results, answered].reverse().findIndex((a) => a.check.verdict !== 'correct');
    setReaction(reactionText(persona, check.recommended, streak < 0 ? results.length + 1 : streak));
  };

  const correct = results.filter((r) => r.check.verdict === 'correct').length;

  return (
    <>
      <PageHeader title="AI 例文クイズ" />
      <PageBody>
        {!ready && (
          <Card className="space-y-3 p-5 text-center">
            <Wand2 className="mx-auto size-8 text-accent-600" />
            <p className="font-medium">AI 例文クイズには AI モデルが必要です</p>
            <p className="text-sm text-slate-500">
              AI が新しい例文で穴埋め問題を作ります。出題する項目と採点はアプリが担当します。
            </p>
            <Link href="/models">
              <Button variant="primary">
                {engineStatus === 'loading' ? '読み込み中…' : 'AI モデルを読み込む'}
              </Button>
            </Link>
          </Card>
        )}

        {ready && phase.kind === 'intro' && (
          <Card className="space-y-4 p-5 text-center">
            <div className="text-4xl" aria-hidden>
              {persona.emoji}
            </div>
            <div>
              <h2 className="text-lg font-semibold">新しい例文で腕だめし</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                思い出しにくくなっている単語・フレーズから {COUNT} 問。AI
                が教材にない例文で穴埋め問題を作ります。 練習なので、復習の予定は変わりません。
              </p>
            </div>
            <Button variant="primary" size="lg" onClick={() => void start()}>
              <Sparkles />
              はじめる
            </Button>
          </Card>
        )}

        {ready && phase.kind === 'running' && (
          <>
            <div className="flex items-center justify-between px-1 text-sm text-slate-500">
              <span>
                {results.length + (current ? 0 : 1)} / {total} 問目
              </span>
              <span>正解 {correct}</span>
            </div>
            <Card className="space-y-5 px-4 py-8 sm:px-8">
              {!question ? (
                <div className="flex flex-col items-center gap-2 py-6 text-sm text-slate-500">
                  <Loader2 className="size-6 animate-spin" />
                  {persona.name}が問題を作っています…
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-center gap-1">
                    <Sentence
                      text={question.sentence}
                      answer={current ? question.answer : undefined}
                    />
                    {current && (
                      <SpeakButton
                        text={question.sentence.replace('___', question.answer)}
                        lang={speechLang(question.lang)}
                      />
                    )}
                  </div>
                  {question.translation && (
                    <p className="text-center text-sm text-slate-500 dark:text-slate-400">
                      {question.translation}
                    </p>
                  )}
                  {!current ? (
                    <form
                      className="mx-auto flex w-full max-w-md gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        submit();
                      }}
                    >
                      <input
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        autoFocus
                        autoComplete="off"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        lang="en"
                        aria-label="空欄に入る語句"
                        placeholder={`ヒント: ${question.target}`}
                        className="h-12 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-base dark:border-slate-700 dark:bg-slate-950"
                      />
                      <Button type="submit" variant="primary" size="lg">
                        答える
                      </Button>
                    </form>
                  ) : (
                    <div className="space-y-4 text-center">
                      <p
                        className={cn(
                          'font-semibold',
                          current.check.verdict === 'correct'
                            ? 'text-emerald-600'
                            : current.check.verdict === 'close'
                              ? 'text-amber-600'
                              : 'text-rose-600',
                        )}
                      >
                        {current.check.verdict === 'correct'
                          ? '正解！'
                          : current.check.verdict === 'close'
                            ? '惜しい！'
                            : '残念…'}
                        <span className="ml-2 font-normal text-slate-600 dark:text-slate-300">
                          あなたの答え: {current.answer || '（空欄）'}
                        </span>
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        <span aria-hidden>{persona.emoji} </span>
                        {reaction}
                      </p>
                      <Button variant="primary" onClick={() => void nextQuestion()}>
                        次へ
                        <ArrowRight />
                      </Button>
                    </div>
                  )}
                </>
              )}
            </Card>
          </>
        )}

        {phase.kind === 'done' && (
          <Card className="space-y-4 p-5 text-center">
            <PartyPopper className="mx-auto size-8 text-accent-600" />
            <h2 className="text-lg font-semibold">
              {results.length} 問中 {correct} 問正解
            </h2>
            <ul className="space-y-1 text-left text-sm">
              {results.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span>
                    {r.check.verdict === 'correct'
                      ? '⭕'
                      : r.check.verdict === 'close'
                        ? '🔺'
                        : '❌'}
                  </span>
                  <span className="min-w-0">
                    {r.question.sentence.replace('___', `【${r.question.answer}】`)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/">
                <Button variant="secondary">ホームへ</Button>
              </Link>
              <Button variant="primary" onClick={() => void start()}>
                <RotateCcw />
                もう一度
              </Button>
            </div>
          </Card>
        )}

        {phase.kind === 'error' && (
          <Card className="space-y-3 p-5 text-center text-sm">
            <p className="text-rose-600">{phase.message}</p>
            <Button variant="secondary" onClick={() => setPhase({ kind: 'intro' })}>
              戻る
            </Button>
          </Card>
        )}
      </PageBody>
    </>
  );
}
