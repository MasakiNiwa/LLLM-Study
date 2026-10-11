import { useState } from 'react';
import {
  ArrowUp,
  ClipboardCheck,
  Loader2,
  MessagesSquare,
  Plus,
  RotateCcw,
  Square,
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'wouter';
import { PageBody, PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dialog } from '@/components/ui/Dialog';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { addUserItem } from '@/lib/packs/userPack';
import { languageName, speechLang } from '@/lib/speech/lang';
import { cn } from '@/lib/utils/cn';
import { errorMessage } from '@/lib/utils/format';
import { useEngine } from '@/features/engine/engineStore';
import { SpeakButton } from '@/features/items/ItemCard';
import { useLibrary } from '@/features/library/libraryStore';
import { usePractice, type PracticeMessage } from '@/features/practice/practiceStore';
import {
  LEVEL_LABELS,
  PRACTICE_LANGUAGES,
  SCENARIOS,
  splitTranslation,
  type PracticeLevel,
  type Scenario,
} from '@/features/practice/scenarios';
import { pickQuizItems } from '@/features/quiz/quizSelect';
import { targetOf } from '@/features/quiz/quizGen';

function AiBubble({ message, lang }: { message: PracticeMessage; lang: string }) {
  const [showTr, setShowTr] = useState(false);
  const { line, translation } = splitTranslation(message.text);
  return (
    <div className="flex max-w-[88%] flex-col items-start gap-1">
      <div className="rounded-2xl rounded-bl-sm bg-white px-4 py-2.5 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
        <p className="whitespace-pre-wrap">{line || (message.streaming ? '…' : '')}</p>
        {showTr && translation && (
          <p className="mt-1 border-t border-slate-100 pt-1 text-sm text-slate-500 dark:border-slate-800">
            {translation}
          </p>
        )}
      </div>
      {!message.streaming && line && (
        <div className="flex items-center gap-1 pl-1">
          <SpeakButton text={line} lang={speechLang(lang)} />
          {translation && (
            <button
              type="button"
              onClick={() => setShowTr((v) => !v)}
              className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-200/60 dark:hover:bg-slate-800"
            >
              {showTr ? '訳を隠す' : '訳を見る'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Setup() {
  const packs = useLibrary((s) => s.packs);
  const start = usePractice((s) => s.start);
  const defaultLang = packs.map((p) => p.language?.target).find((l) => l && l !== 'ja') ?? 'en';
  const [lang, setLang] = useState<string>(defaultLang);
  const [level, setLevel] = useState<PracticeLevel>('easy');
  const [useVocab, setUseVocab] = useState(true);
  const [custom, setCustom] = useState('');
  const [starting, setStarting] = useState(false);

  const begin = async (scenario: Scenario) => {
    setStarting(true);
    try {
      const vocab = useVocab
        ? (await pickQuizItems(20))
            .filter((p) => (p.lang ?? 'en').startsWith(lang))
            .slice(0, 5)
            .map((p) => targetOf(p.item))
        : [];
      await start({ scenario, lang, level, vocab });
    } catch (e) {
      toast.error('会話を始められませんでした', { description: errorMessage(e) });
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-4 p-4 sm:p-5">
        <div>
          <h2 className="font-semibold">場面を選んで会話する</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            AI
            が役を演じて話しかけてきます。間違えても大丈夫。終わったら「添削」で直してもらい、覚えたい表現はマイカードに追加できます。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="space-y-1">
            <span className="text-sm font-medium">言語</span>
            <Select
              value={lang}
              onChange={setLang}
              options={PRACTICE_LANGUAGES.map((l) => ({ value: l, label: languageName(l) }))}
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">レベル</span>
            <Select
              value={level}
              onChange={(v) => setLevel(v as PracticeLevel)}
              options={(Object.keys(LEVEL_LABELS) as PracticeLevel[]).map((l) => ({
                value: l,
                label: LEVEL_LABELS[l],
              }))}
            />
          </label>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium">学習中の語句を会話に取り入れる</div>
            <p className="text-xs text-slate-500">
              思い出しにくくなっている単語・フレーズを AI に使ってもらいます
            </p>
          </div>
          <Switch checked={useVocab} onChange={setUseVocab} label="学習中の語句を取り入れる" />
        </div>
      </Card>
      <div className="grid gap-2 sm:grid-cols-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={starting}
            onClick={() => void begin(s)}
            className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-accent-400 hover:bg-accent-50/50 disabled:opacity-60 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-accent-900/20"
          >
            <span className="text-2xl" aria-hidden>
              {s.emoji}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">{s.title}</span>
              <span className="block text-xs text-slate-500">
                AI: {s.aiRole} / あなた: {s.userRole}
              </span>
            </span>
          </button>
        ))}
      </div>
      <Card className="space-y-2 p-4">
        <div className="text-sm font-medium">自由に場面を決める</div>
        <div className="flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="例: 空港で乗り継ぎ便について聞く"
            className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-950"
          />
          <Button
            variant="primary"
            disabled={!custom.trim() || starting}
            onClick={() =>
              void begin({
                id: 'custom',
                title: custom.trim(),
                emoji: '💬',
                situation: custom.trim(),
                aiRole: 'その場面にふさわしい相手',
                userRole: '学習者',
              })
            }
          >
            始める
          </Button>
        </div>
      </Card>
      {starting && (
        <p className="flex items-center justify-center gap-2 text-sm text-slate-500">
          <Loader2 className="size-4 animate-spin" />
          準備しています…
        </p>
      )}
    </div>
  );
}

function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const feedback = usePractice((s) => s.feedback);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const add = async (i: number) => {
    const c = feedback?.corrections[i];
    if (!c) return;
    try {
      await addUserItem({
        type: 'phrase',
        phrase: c.corrected,
        meaning: c.meaning || c.note || '（会話練習で直した表現）',
        notes: [`元の文: ${c.original}`, c.note].filter(Boolean).join('\n'),
      });
      setAdded((s) => new Set(s).add(i));
      void useLibrary.getState().refresh();
      toast.success('マイカードに追加しました');
    } catch (e) {
      toast.error('追加できませんでした', { description: errorMessage(e) });
    }
  };
  return (
    <Dialog open={open} title="添削" onClose={onClose}>
      {feedback && (
        <div className="space-y-3">
          {feedback.good && (
            <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
              👍 {feedback.good}
            </p>
          )}
          {feedback.corrections.length === 0 && (
            <p className="text-sm text-slate-600 dark:text-slate-400">
              直すところは見つかりませんでした。
            </p>
          )}
          {feedback.corrections.map((c, i) => (
            <div
              key={i}
              className="space-y-1 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700"
            >
              <p className="text-slate-500 line-through">{c.original}</p>
              <p className="font-semibold">{c.corrected}</p>
              {c.meaning && <p className="text-slate-600 dark:text-slate-400">{c.meaning}</p>}
              {c.note && <p className="text-xs text-slate-500">{c.note}</p>}
              <div className="flex justify-end">
                <Button
                  size="sm"
                  variant={added.has(i) ? 'ghost' : 'secondary'}
                  disabled={added.has(i)}
                  onClick={() => void add(i)}
                >
                  <Plus />
                  {added.has(i) ? '追加済み' : 'カードにする'}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}

function Conversation() {
  const config = usePractice((s) => s.config)!;
  const messages = usePractice((s) => s.messages);
  const generating = usePractice((s) => s.generating);
  const feedbackLoading = usePractice((s) => s.feedbackLoading);
  const { send, stop, requestFeedback } = usePractice.getState();
  const [text, setText] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const userCount = messages.filter((m) => m.role === 'user' && !m.hidden).length;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl space-y-4 px-3 py-4 sm:px-4">
          <div className="flex items-center justify-center gap-2 text-xs text-slate-500">
            <span aria-hidden>{config.scenario.emoji}</span>
            {config.scenario.title} · {languageName(config.lang)} · {LEVEL_LABELS[config.level]}
          </div>
          {config.vocab.length > 0 && (
            <p className="text-center text-xs text-slate-400">
              取り入れる語句: {config.vocab.join(', ')}
            </p>
          )}
          {messages
            .filter((m) => !m.hidden)
            .map((m) =>
              m.role === 'assistant' ? (
                <AiBubble key={m.id} message={m} lang={config.lang} />
              ) : (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent-600 px-4 py-2.5 whitespace-pre-wrap text-white">
                    {m.text}
                  </div>
                </div>
              ),
            )}
          {generating && messages.at(-1)?.text === '' && (
            <p className="text-sm text-slate-400">入力中…</p>
          )}
        </div>
      </div>
      <div className="shrink-0 px-3 pt-2 pb-3 sm:px-4">
        <div className="mx-auto mb-2 flex w-full max-w-2xl justify-end">
          <Button
            size="sm"
            variant="secondary"
            disabled={userCount === 0 || feedbackLoading || generating}
            onClick={async () => {
              await requestFeedback();
              if (usePractice.getState().feedback) setShowFeedback(true);
            }}
          >
            {feedbackLoading ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
            添削してもらう
          </Button>
        </div>
        <form
          className="mx-auto flex w-full max-w-2xl items-end gap-2 rounded-3xl border border-slate-300 bg-white p-1.5 pl-4 shadow-sm focus-within:border-accent-500 dark:border-slate-700 dark:bg-slate-900"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim() || generating) return;
            void send(text);
            setText('');
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                !matchMedia('(pointer: coarse)').matches
              ) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            rows={1}
            lang={config.lang}
            autoCapitalize="sentences"
            placeholder={`${languageName(config.lang)}で返事をする…`}
            aria-label="返事"
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none [field-sizing:content] placeholder:text-slate-400"
          />
          {generating ? (
            <Button
              variant="secondary"
              size="icon"
              onClick={stop}
              aria-label="停止"
              className="rounded-full"
            >
              <Square className="fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              variant="primary"
              size="icon"
              disabled={!text.trim()}
              aria-label="送信"
              className={cn('rounded-full')}
            >
              <ArrowUp />
            </Button>
          )}
        </form>
      </div>
      <FeedbackDialog open={showFeedback} onClose={() => setShowFeedback(false)} />
    </>
  );
}

/** 会話練習（AI が役を演じるロールプレイ。添削は AI、カードへの保存はアプリ） */
export default function PracticePage() {
  const ready = useEngine((s) => s.status === 'ready');
  const engineStatus = useEngine((s) => s.status);
  const active = usePractice((s) => s.config !== null);
  const reset = usePractice((s) => s.reset);

  return (
    <>
      <PageHeader
        title="会話練習"
        actions={
          active && (
            <Button size="sm" variant="ghost" onClick={reset}>
              <RotateCcw />
              場面を変える
            </Button>
          )
        }
      />
      {!ready ? (
        <PageBody>
          <Card className="space-y-3 p-5 text-center">
            <MessagesSquare className="mx-auto size-8 text-accent-600" />
            <p className="font-medium">会話練習には AI モデルが必要です</p>
            <Link href="/models">
              <Button variant="primary">
                {engineStatus === 'loading' ? '読み込み中…' : 'AI モデルを読み込む'}
              </Button>
            </Link>
          </Card>
        </PageBody>
      ) : active ? (
        <Conversation />
      ) : (
        <PageBody>
          <Setup />
        </PageBody>
      )}
    </>
  );
}
