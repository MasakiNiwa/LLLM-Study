import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Loader2, MessageCircle, Sparkles, Square } from 'lucide-react';
import { toast } from 'sonner';
import { Link, useLocation } from 'wouter';
import { Button } from '@/components/ui/Button';
import type { CardRecord } from '@/lib/db/types';
import { errorMessage } from '@/lib/utils/format';
import { useAiBusy } from '@/features/ai/aiBusy';
import { ASSIST_ACTIONS, assistPrompt, type AssistAction } from '@/features/ai/assist';
import { useAiFocus } from '@/features/ai/focusStore';
import { cancelAi, runOneshot } from '@/features/ai/oneshot';
import { getPersona } from '@/features/ai/personas';
import { cardForLlm } from '@/features/ai/studyContext';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings } from '@/features/settings/settingsStore';

const Markdown = lazy(() => import('@/features/chat/markdown/Markdown'));

/** 答えを見たあとに「AI に聞く」ための操作と応答（カードごとに key を変えて作り直す） */
export function AiAssistPanel({ card }: { card: CardRecord }) {
  const engineStatus = useEngine((s) => s.status);
  const busyTask = useAiBusy((s) => s.task);
  const personaId = useSettings((s) => s.persona);
  const custom = useSettings((s) => s.customPersona);
  const attach = useAiFocus((s) => s.attach);
  const [, navigate] = useLocation();
  const [answer, setAnswer] = useState<{ action: AssistAction; text: string } | null>(null);
  const [running, setRunning] = useState(false);
  const cardIdRef = useRef(card.id);

  // カードが変わる（＝このパネルが作り直される）ときは生成中の応答を止める
  useEffect(() => {
    cardIdRef.current = card.id;
    return () => {
      if (useAiBusy.getState().task === 'assist') cancelAi();
    };
  }, [card.id]);

  const persona = getPersona(personaId, custom);
  const ready = engineStatus === 'ready';

  const ask = async (action: AssistAction) => {
    const json = await cardForLlm(card, { revealed: true });
    if (!json) return;
    setRunning(true);
    setAnswer({ action, text: '' });
    const id = card.id;
    try {
      const r = await runOneshot({
        task: 'assist',
        prompt: assistPrompt(action, json),
        onText: (text) => cardIdRef.current === id && setAnswer({ action, text }),
      });
      if (cardIdRef.current === id)
        setAnswer({ action, text: r.text || '（応答がありませんでした）' });
    } catch (e) {
      toast.error('AI に聞けませんでした', { description: errorMessage(e) });
      if (cardIdRef.current === id) setAnswer(null);
    } finally {
      setRunning(false);
    }
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
      <div className="flex flex-wrap gap-2">
        {ASSIST_ACTIONS.map((a) => (
          <Button
            key={a.id}
            size="sm"
            variant={answer?.action === a.id ? 'primary' : 'secondary'}
            disabled={running || (busyTask !== null && busyTask !== 'reaction')}
            onClick={() => void ask(a.id)}
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
      {answer && (
        <div className="animate-fade-in rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
            <span className="text-lg" aria-hidden>
              {persona.emoji}
            </span>
            <span className="font-medium">{persona.name}</span>
            {running && (
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
          <div className="prose-chat">
            <Suspense fallback={<p className="whitespace-pre-wrap">{answer.text}</p>}>
              <Markdown text={answer.text || '…'} />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
