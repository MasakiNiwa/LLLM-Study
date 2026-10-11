/**
 * 項目（単語・フレーズ・一問一答・穴埋め・選択問題）のカード表示。
 * 種類を増やすときは lib/packs/schema.ts・templates.ts と、ここに表示を追加する。
 */
import { useState, type ReactNode } from 'react';
import { BookOpenText, CheckCircle2, Lightbulb, Volume2, XCircle } from 'lucide-react';
import type { ItemRecord } from '@/lib/db/types';
import { clozeAnswers, orderChunks, shuffleChunks } from '@/lib/packs/itemText';
import { languageName } from '@/lib/speech/lang';
import type {
  ChoiceItem,
  ClozeItem,
  Example,
  OrderItem,
  Passage,
  PhraseItem,
  QaItem,
  VocabItem,
} from '@/lib/packs/schema';
import { speak } from '@/lib/speech/tts';
import { cn } from '@/lib/utils/cn';
import { useSettings } from '@/features/settings/settingsStore';

export function SpeakButton({ text, lang = 'en-US' }: { text: string; lang?: string }) {
  const rate = useSettings((s) => s.speechRate);
  const voice = useSettings((s) => s.speechVoice);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        // 設定で選ぶ声は英語用なので、ほかの言語では端末の既定の声を使う
        void speak(text, {
          lang,
          rate,
          voiceURI: lang.startsWith('en') ? voice || undefined : undefined,
        });
      }}
      aria-label="読み上げる"
      title="読み上げる"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-accent-700 transition-colors hover:bg-accent-50 active:bg-accent-100 dark:text-accent-300 dark:hover:bg-accent-900/30"
    >
      <Volume2 className="size-5" />
    </button>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 text-[0.7rem] font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
      {children}
    </div>
  );
}

function Examples({ examples, lang }: { examples?: Example[]; lang: string }) {
  if (!examples?.length) return null;
  return (
    <div>
      <Label>例文</Label>
      <ul className="space-y-2">
        {examples.map((ex, i) => (
          <li key={i} className="flex gap-1">
            <div className="min-w-0 flex-1">
              <p className="leading-snug">{ex.text}</p>
              {ex.translation && (
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {ex.translation}
                </p>
              )}
            </div>
            <SpeakButton text={ex.text} lang={lang} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Chips({ title, values }: { title: string; values?: string[] }) {
  if (!values?.length) return null;
  return (
    <div>
      <Label>{title}</Label>
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="rounded-lg bg-slate-100 px-2 py-0.5 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            {v}
          </span>
        ))}
      </div>
    </div>
  );
}

function Notes({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      {text}
    </p>
  );
}

function Explanation({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div>
      <Label>解説</Label>
      <p className="leading-relaxed">{text}</p>
    </div>
  );
}

function Headword({ text, sub, lang }: { text: string; sub?: ReactNode; lang: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div className="flex items-center gap-1">
        <span className="text-3xl font-bold tracking-tight break-words sm:text-4xl">{text}</span>
        <SpeakButton text={text} lang={lang} />
      </div>
      {sub && <div className="text-sm text-slate-500 dark:text-slate-400">{sub}</div>}
    </div>
  );
}

function Prompt({ children }: { children: ReactNode }) {
  return (
    <div className="text-center text-xl leading-relaxed font-semibold sm:text-2xl">{children}</div>
  );
}

/** ヒントを 1 つずつ表示するボタン */
function Hints({ hints }: { hints?: string[] }) {
  const [shown, setShown] = useState(0);
  if (!hints?.length) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      {hints.slice(0, shown).map((h, i) => (
        <p key={i} className="text-sm text-amber-700 dark:text-amber-300">
          ヒント: {h}
        </p>
      ))}
      {shown < hints.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + 1)}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
        >
          <Lightbulb className="size-4" />
          ヒントを見る
        </button>
      )}
    </div>
  );
}

// ---- 種類ごとの表示 ----

function VocabFace({ item, template, side, lang }: FaceProps<VocabItem>) {
  const sub = [item.reading, item.pos].filter(Boolean).join('　');
  const recall = template === 'recall';
  const listen = template === 'listen';
  if (side === 'front' && listen) return <ListenPrompt text={item.term} lang={lang} />;
  if (side === 'front') {
    return recall ? (
      <div className="space-y-2">
        <Prompt>{item.meanings.join('、')}</Prompt>
        {item.pos && <p className="text-center text-sm text-slate-500">{item.pos}</p>}
        <p className="text-center text-sm text-slate-500">この意味の単語は？</p>
      </div>
    ) : (
      <Headword text={item.term} sub={sub} lang={lang} />
    );
  }
  return (
    <div className="space-y-4">
      {listen && <Headword text={item.term} sub={sub} lang={lang} />}
      {recall ? (
        <Headword text={item.term} sub={sub} lang={lang} />
      ) : (
        <ol className="mx-auto w-fit max-w-full space-y-1 text-lg font-medium">
          {item.meanings.map((m, i) => (
            <li key={i}>{item.meanings.length > 1 ? `${i + 1}. ${m}` : m}</li>
          ))}
        </ol>
      )}
      <Examples examples={item.examples} lang={lang} />
      <Chips title="よく使う組み合わせ" values={item.collocations} />
      <Chips title="類義語" values={item.synonyms} />
      <Chips title="対義語" values={item.antonyms} />
      <Notes text={item.notes} />
    </div>
  );
}

function PhraseFace({ item, template, side, lang }: FaceProps<PhraseItem>) {
  const recall = template === 'recall';
  const listen = template === 'listen';
  if (side === 'front' && listen) return <ListenPrompt text={item.phrase} lang={lang} />;
  if (side === 'front') {
    return recall ? (
      <div className="space-y-2">
        <Prompt>{item.meaning}</Prompt>
        {item.situation && <p className="text-center text-sm text-slate-500">{item.situation}</p>}
        <p className="text-center text-sm text-slate-500">{languageName(lang)}で言うと？</p>
      </div>
    ) : (
      <Headword text={item.phrase} sub={item.situation} lang={lang} />
    );
  }
  return (
    <div className="space-y-4">
      {listen && <Headword text={item.phrase} sub={item.situation} lang={lang} />}
      {recall ? (
        <Headword text={item.phrase} lang={lang} />
      ) : (
        <p className="text-center text-lg font-medium">{item.meaning}</p>
      )}
      <Examples examples={item.examples} lang={lang} />
      <Notes text={item.notes} />
    </div>
  );
}

function QaFace({ item, side }: FaceProps<QaItem>) {
  if (side === 'front') {
    return (
      <div className="space-y-3">
        <Prompt>{item.question}</Prompt>
        <Hints hints={item.hints} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-center text-lg font-medium whitespace-pre-line">{item.answer}</p>
      {item.accepted?.length ? (
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          別解: {item.accepted.join('・')}
        </p>
      ) : null}
      <Explanation text={item.explanation} />
      <Notes text={item.notes} />
    </div>
  );
}

function ClozeText({ text, reveal }: { text: string; reveal: boolean }) {
  const parts = text.split(/(\{\{[^{}]+\}\})/g);
  return (
    <p className="text-center text-xl leading-loose font-medium sm:text-2xl">
      {parts.map((p, i) => {
        const m = /^\{\{([^{}]+)\}\}$/.exec(p);
        if (!m) return <span key={i}>{p}</span>;
        return reveal ? (
          <mark
            key={i}
            className="rounded-md bg-accent-100 px-1 text-accent-900 dark:bg-accent-900/50 dark:text-accent-100"
          >
            {m[1]}
          </mark>
        ) : (
          <span
            key={i}
            className="mx-0.5 inline-block min-w-16 border-b-2 border-accent-500 text-transparent select-none"
          >
            {m[1].replace(/./g, '_')}
          </span>
        );
      })}
    </p>
  );
}

function ClozeFace({ item, side, lang }: FaceProps<ClozeItem>) {
  if (side === 'front') {
    return (
      <div className="space-y-3">
        <ClozeText text={item.text} reveal={false} />
        {item.translation && (
          <p className="text-center text-sm text-slate-500 dark:text-slate-400">
            {item.translation}
          </p>
        )}
        <Hints hints={item.hint ? [item.hint] : undefined} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-1">
        <ClozeText text={item.text} reveal />
        <SpeakButton text={item.text.replace(/\{\{([^{}]+)\}\}/g, '$1')} lang={lang} />
      </div>
      <p className="text-center text-sm text-slate-500">
        答え: {clozeAnswers(item.text).join(' / ')}
      </p>
      <Explanation text={item.explanation} />
      <Notes text={item.notes} />
    </div>
  );
}

function ChoiceFace({ item, side, chosen, onChoose }: FaceProps<ChoiceItem>) {
  const answered = chosen !== undefined;
  return (
    <div className="space-y-4">
      {side === 'front' && <Prompt>{item.question}</Prompt>}
      {side === 'front' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {item.choices.map((c, i) => {
            const isAnswer = i === item.answer;
            const isChosen = i === chosen;
            return (
              <button
                key={i}
                type="button"
                disabled={answered}
                onClick={() => onChoose?.(i)}
                className={cn(
                  'flex items-center gap-2 rounded-xl border px-4 py-3 text-left font-medium transition-colors',
                  !answered &&
                    'border-slate-300 bg-white hover:border-accent-400 hover:bg-accent-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-accent-900/20',
                  answered &&
                    isAnswer &&
                    'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200',
                  answered &&
                    isChosen &&
                    !isAnswer &&
                    'border-rose-400 bg-rose-50 text-rose-900 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-200',
                  answered &&
                    !isAnswer &&
                    !isChosen &&
                    'border-slate-200 opacity-60 dark:border-slate-800',
                )}
              >
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs dark:bg-slate-800">
                  {i + 1}
                </span>
                <span className="flex-1">{c}</span>
                {answered && isAnswer && <CheckCircle2 className="size-5 text-emerald-600" />}
                {answered && isChosen && !isAnswer && <XCircle className="size-5 text-rose-600" />}
              </button>
            );
          })}
        </div>
      )}
      {side === 'back' && (
        <>
          <p
            className={cn(
              'text-center text-lg font-semibold',
              chosen === item.answer ? 'text-emerald-600' : 'text-rose-600',
            )}
          >
            {chosen === undefined ? '' : chosen === item.answer ? '正解！' : '不正解'}
            <span className="ml-2 font-normal text-slate-600 dark:text-slate-300">
              答え: {item.choices[item.answer]}
            </span>
          </p>
          <Explanation text={item.explanation} />
          <Notes text={item.notes} />
        </>
      )}
    </div>
  );
}

/** 聞き取りカードの表面: 文字は見せず、音声だけを流す */
function ListenPrompt({ text, lang }: { text: string; lang: string }) {
  const rate = useSettings((s) => s.speechRate);
  const voice = useSettings((s) => s.speechVoice);
  const play = (slow = false) =>
    void speak(text, {
      lang,
      rate: slow ? Math.max(0.5, rate * 0.7) : rate,
      voiceURI: lang.startsWith('en') ? voice || undefined : undefined,
    });
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => play()}
        aria-label="もう一度聞く"
        className="flex size-20 items-center justify-center rounded-full bg-accent-600 text-white shadow-md transition-transform hover:bg-accent-700 active:scale-95"
      >
        <Volume2 className="size-9" />
      </button>
      <button
        type="button"
        onClick={() => play(true)}
        className="rounded-full px-3 py-1 text-sm text-accent-700 hover:bg-accent-50 dark:text-accent-300 dark:hover:bg-accent-900/30"
      >
        ゆっくり聞く
      </button>
      <p className="text-sm text-slate-500">聞こえた語句の意味は？</p>
    </div>
  );
}

function OrderFace({ item, side, lang, ordered, onOrder, seed }: FaceProps<OrderItem>) {
  const chunks = orderChunks(item);
  const [shuffled] = useState(() => shuffleChunks(chunks, seed ?? item.id));
  const [picked, setPicked] = useState<number[]>([]);
  const joiner = /\s/.test(item.answer.trim()) ? ' ' : '';
  const answered = ordered !== undefined;

  if (side === 'back') {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-center gap-1">
          <p className="text-center text-lg font-medium">{item.answer}</p>
          <SpeakButton text={item.answer} lang={lang} />
        </div>
        <Explanation text={item.explanation} />
        <Notes text={item.notes} />
      </div>
    );
  }

  const built = answered ? ordered.built : picked.map((i) => chunks[i]);
  return (
    <div className="space-y-4">
      {item.prompt && <Prompt>{item.prompt}</Prompt>}
      <div
        className={cn(
          'flex min-h-14 flex-wrap items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-3 py-2',
          !answered && 'border-slate-300 dark:border-slate-700',
          answered && ordered.correct && 'border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30',
          answered && !ordered.correct && 'border-rose-400 bg-rose-50 dark:bg-rose-950/30',
        )}
        aria-label="並べた語句"
      >
        {built.length === 0 && (
          <span className="text-sm text-slate-400">語句をタップして並べる</span>
        )}
        {built.map((c, k) => (
          <button
            key={k}
            type="button"
            disabled={answered}
            onClick={() => setPicked((p) => p.filter((_, i) => i !== k))}
            className="rounded-lg bg-white px-2.5 py-1.5 font-medium shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"
          >
            {c}
          </button>
        ))}
      </div>
      {!answered && (
        <>
          <div className="flex flex-wrap justify-center gap-2">
            {shuffled.map((i) => {
              const used = picked.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  disabled={used}
                  onClick={() => setPicked((p) => [...p, i])}
                  className={cn(
                    'rounded-lg border px-3 py-2 font-medium transition-colors',
                    used
                      ? 'border-transparent text-transparent'
                      : 'border-slate-300 bg-white hover:border-accent-400 hover:bg-accent-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-accent-900/20',
                  )}
                >
                  {chunks[i]}
                </button>
              );
            })}
          </div>
          <div className="flex justify-center gap-2">
            <button
              type="button"
              onClick={() => setPicked([])}
              disabled={picked.length === 0}
              className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800"
            >
              やり直す
            </button>
            <button
              type="button"
              disabled={picked.length !== chunks.length}
              onClick={() => {
                const b = picked.map((i) => chunks[i]);
                onOrder?.({ built: b, correct: b.join(joiner) === chunks.join(joiner) });
              }}
              className="rounded-lg bg-accent-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-accent-700 disabled:bg-slate-300 dark:disabled:bg-slate-700"
            >
              答え合わせ
            </button>
          </div>
        </>
      )}
      {answered && (
        <p
          className={cn(
            'flex items-center justify-center gap-1 font-semibold',
            ordered.correct ? 'text-emerald-600' : 'text-rose-600',
          )}
        >
          {ordered.correct ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
          {ordered.correct ? '正解！' : '順番が違います'}
        </p>
      )}
    </div>
  );
}

/**
 * 長文読解などの本文。表の面では問題の上に、裏の面では訳（あれば）を出す。
 * 長い本文はこの枠の中でスクロールする。
 */
export function PassageBlock({
  passage,
  side,
  lang,
}: {
  passage: Passage;
  side: 'front' | 'back';
  lang: string;
}) {
  if (side === 'back') {
    if (!passage.translation) return null;
    return (
      <details className="mb-6 rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/50">
        <summary className="cursor-pointer font-medium text-slate-600 dark:text-slate-300">
          本文の訳
        </summary>
        <p className="mt-2 leading-relaxed whitespace-pre-line text-slate-700 dark:text-slate-300">
          {passage.translation}
        </p>
      </details>
    );
  }
  return (
    <section
      className="mb-6 rounded-xl border border-slate-200 bg-slate-50/70 text-left dark:border-slate-700 dark:bg-slate-800/40"
      aria-label="本文"
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <BookOpenText className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{passage.title ?? '本文'}</span>
        <SpeakButton text={passage.text} lang={lang} />
      </div>
      <p
        lang={lang}
        className="max-h-56 overflow-y-auto px-3 py-2.5 leading-relaxed whitespace-pre-line sm:max-h-80"
      >
        {passage.text}
      </p>
      {passage.source && (
        <p className="px-3 pb-2 text-right text-[0.7rem] text-slate-400">出典: {passage.source}</p>
      )}
    </section>
  );
}

/** 並べ替えの結果 */
export interface OrderResult {
  built: string[];
  correct: boolean;
}

interface FaceProps<T> {
  item: T;
  template: string;
  side: 'front' | 'back';
  lang: string;
  /** 選択問題で選んだ番号 */
  chosen?: number;
  onChoose?: (index: number) => void;
  /** 並べ替えの結果（答え合わせ後） */
  ordered?: OrderResult;
  onOrder?: (result: OrderResult) => void;
  /** 並べ替えのシャッフルの種 */
  seed?: string;
}

export interface CardFaceProps {
  record: ItemRecord;
  template: string;
  side: 'front' | 'back';
  /** 学ぶ言語（読み上げ用） */
  lang?: string;
  chosen?: number;
  onChoose?: (index: number) => void;
  ordered?: OrderResult;
  onOrder?: (result: OrderResult) => void;
  seed?: string;
}

export function CardFace({
  record,
  template,
  side,
  lang = 'en-US',
  chosen,
  onChoose,
  ordered,
  onOrder,
  seed,
}: CardFaceProps) {
  const face = (
    <Face
      record={record}
      template={template}
      side={side}
      lang={lang}
      chosen={chosen}
      onChoose={onChoose}
      ordered={ordered}
      onOrder={onOrder}
      seed={seed}
    />
  );
  const image = record.item.image;
  if (!record.passage && !image) return face;
  return (
    <>
      {record.passage && <PassageBlock passage={record.passage} side={side} lang={lang} />}
      {image && side === 'front' && (
        <img
          src={image}
          alt="問題の画像"
          className="mx-auto mb-5 max-h-56 rounded-xl object-contain sm:max-h-72"
        />
      )}
      {face}
    </>
  );
}

function Face({
  record,
  template,
  side,
  lang = 'en-US',
  chosen,
  onChoose,
  ordered,
  onOrder,
  seed,
}: CardFaceProps) {
  const item = record.item;
  const common = { template, side, lang, chosen, onChoose, ordered, onOrder, seed };
  switch (item.type) {
    case 'vocab':
      return <VocabFace item={item} {...common} />;
    case 'phrase':
      return <PhraseFace item={item} {...common} />;
    case 'qa':
      return <QaFace item={item} {...common} />;
    case 'cloze':
      return <ClozeFace item={item} {...common} />;
    case 'choice':
      return <ChoiceFace item={item} {...common} />;
    case 'order':
      return <OrderFace item={item} {...common} />;
  }
}
