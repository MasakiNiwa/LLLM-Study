import { lazy, Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { Loader2, MessageCircle, SendHorizontal, Sparkles, Square } from 'lucide-react';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/Button';
import type { CardRecord } from '@/lib/db/types';
import { useAiBusy } from '@/features/ai/aiBusy';
import {
  assistActions,
  assistPrompt,
  followupPrompt,
  type AssistAction,
} from '@/features/ai/assist';
import { isLanguagePack } from '@/lib/packs/subjects';
import { useLibrary } from '@/features/library/libraryStore';
import { useAiFocus } from '@/features/ai/focusStore';
import { cancelAi } from '@/features/ai/oneshot';
import { getPersona } from '@/features/ai/personas';
import { cardForLlm } from '@/features/ai/studyContext';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings } from '@/features/settings/settingsStore';
import { currentUserAnswer, useStudy } from './studyStore';
import { useAiReady } from '@/features/cloud/aiClient';
import { useAssistThread, type AssistEntry } from './assistThread';

const Markdown = lazy(() => import('@/features/chat/markdown/Markdown'));

/**
 * 答えを見たあとに「AI に聞く」ための操作と応答。
 * やりとりはカードの表示ごとに残し（画面を離れて戻っても、次のカードに進むまで消えない）、
 * 質問は前のやりとりの下に続けて並べる（ボタンは最後のやりとりの下に出し直す）。
 */
export function AiAssistPanel({ card, threadKey }: { card: CardRecord; threadKey: string }) {
  const engineStatus = useEngine((s) => s.status);
  const busyTask = useAiBusy((s) => s.task);
  const personaId = useSettings((s) => s.persona);
  const custom = useSettings((s) => s.customPersona);
  const attach = useAiFocus((s) => s.attach);
  const [, navigate] = useLocation();
  const open = useAssistThread((s) => s.open);
  const askThread = useAssistThread((s) => s.ask);
  const entries = useAssistThread((s) => (s.key === threadKey ? s.entries : EMPTY));
  const [question, setQuestion] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  // 別のカード（表示）になったら、前のやりとりを捨てる。同じ表示に戻ってきたときは残す
  useEffect(() => {
    open(threadKey);
  }, [open, threadKey]);

  const persona = getPersona(personaId, custom);
  // 語学以外の教材（簿記・歴史など）では、例文の代わりに具体例を出すなど指示を変える
  const pack = useLibrary((s) => s.packs.find((p) => p.id === card.packId));
  const domain = pack && !isLanguagePack(pack) ? 'general' : 'language';
  const ready = useAiReady();
  const running = entries.some((e) => e.status === 'running');
  const disabled = running || (busyTask !== null && busyTask !== 'reaction');

  const cardJson = () =>
    // 自分で答えていたら（書いた答え・仕訳・選んだもの）、その答えも渡す（このカードの今回の表示のものだけ）
    cardForLlm(card, { revealed: true, userAnswer: currentUserAnswer(useStudy.getState()) });

  const send = async (label: string, prompt: (json: Record<string, unknown>) => string) => {
    const json = await cardJson();
    if (!json) return;
    const p = askThread(threadKey, label, prompt(json));
    // 新しい質問が見えるように少し送る
    requestAnimationFrame(() =>
      endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
    );
    await p;
  };
  const ask = (action: AssistAction, label: string) =>
    void send(label, (json) => assistPrompt(action, json, domain));
  const submitQuestion = (e: FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q || disabled) return;
    setQuestion('');
    void send(q, (json) => followupPrompt(q, json));
  };

  const openChat = () => {
    attach(card.id);
    navigate('/chat');
  };

  if (!ready) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-slate-300 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="size-4" />
          AI モデルを読み込むと、解説や例文を AI に聞けます
        </span>
        <Link
          href="/models"
          className="font-medium text-accent-700 hover:underline dark:text-accent-300"
        >
          {engineStatus === 'loading' ? '読み込み中…' : 'モデルを読み込む'}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <div key={entry.id} className="animate-fade-in space-y-2">
          <div className="flex justify-end">
            <span className="max-w-[85%] rounded-2xl rounded-br-md bg-accent-600 px-3 py-1.5 text-sm whitespace-pre-wrap text-white">
              {entry.question}
            </span>
          </div>
          <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
              <span className="text-lg" aria-hidden>
                {persona.emoji}
              </span>
              <span className="font-medium">{persona.name}</span>
              {entry.status === 'running' && (
                <>
                  <Loader2 className="size-3.5 animate-spin" />
                  <button
                    type="button"
                    onClick={cancelAi}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    <Square className="size-3" />
                    停止
                  </button>
                </>
              )}
            </div>
            {entry.status === 'error' ? (
              <p className="text-sm text-rose-600 dark:text-rose-400">{entry.text}</p>
            ) : (
              <div className="prose-chat">
                <Suspense fallback={<p className="whitespace-pre-wrap">{entry.text}</p>}>
                  <Markdown text={entry.text || '…'} />
                </Suspense>
              </div>
            )}
          </div>
        </div>
      ))}
      <div ref={endRef} className="flex flex-wrap gap-2">
        {assistActions(domain).map((a) => (
          <Button
            key={a.id}
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => ask(a.id, a.label)}
            title={a.hint}
          >
            {a.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="ghost"
          onClick={openChat}
          title="このカードについてチャットで質問"
        >
          <MessageCircle />
          チャットで質問
        </Button>
      </div>
      {entries.length > 0 && (
        <form onSubmit={submitQuestion} className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="続けて質問する（例: 似た言い方との違いは？）"
            aria-label="続けて質問する"
            enterKeyHint="send"
            className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-900"
          />
          <Button
            type="submit"
            size="icon"
            variant="primary"
            disabled={disabled || !question.trim()}
            aria-label="質問を送る"
          >
            <SendHorizontal />
          </Button>
        </form>
      )}
    </div>
  );
}

const EMPTY: AssistEntry[] = [];
