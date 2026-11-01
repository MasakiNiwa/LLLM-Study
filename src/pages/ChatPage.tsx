import { useState } from 'react';
import { History, LifeBuoy, Sparkles, SquarePen, X } from 'lucide-react';
import { Link } from 'wouter';
import { PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/Button';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { getPersona } from '@/features/ai/personas';
import { useAiFocus } from '@/features/ai/focusStore';
import { AttachedCard } from '@/features/chat/AttachedCard';
import { useChat } from '@/features/chat/chatStore';
import { Composer } from '@/features/chat/Composer';
import { MessageList } from '@/features/chat/MessageList';
import { ThreadList } from '@/features/chat/ThreadList';
import { LoadProgressCard } from '@/features/models/LoadProgressCard';
import { ModelStatusChip } from '@/features/engine/ModelStatusChip';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings } from '@/features/settings/settingsStore';
import { useAiReady } from '@/features/cloud/aiClient';

const SUGGESTIONS = [
  '今日の学習の調子はどう？',
  '苦手な単語を教えて',
  'take の使い方を例文で教えて',
  '覚えた単語でクイズを出して',
  '「serendipity」をカードにして',
];

/** 使い方モードの質問の例 */
const HELP_SUGGESTIONS = [
  'このアプリで何ができる？',
  'タイマーの設定はどこ？',
  '教材を追加するには？',
  'バックアップの取り方は？',
  'AI モデルを入れるには？',
];

const CARD_SUGGESTIONS = [
  'このカードを詳しく解説して',
  '似た表現との違いは？',
  'このカードで例文クイズを出して',
];

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  const personaId = useSettings((s) => s.persona);
  const custom = useSettings((s) => s.customPersona);
  const ready = useAiReady();
  const engineStatus = useEngine((s) => s.status);
  const attached = useAiFocus((s) => s.attachedCardId);
  const helpMode = useChat((s) => s.helpMode);
  const persona = getPersona(personaId, custom);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-xl flex-col items-center gap-4 px-4 py-10 text-center">
        <div className="flex size-16 items-center justify-center rounded-3xl bg-white text-4xl shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
          {persona.emoji}
        </div>
        <div>
          <h2 className="text-lg font-semibold">{persona.name}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{persona.tagline}</p>
        </div>
        {ready ? (
          <div className="flex flex-wrap justify-center gap-2">
            {(helpMode ? HELP_SUGGESTIONS : attached ? CARD_SUGGESTIONS : SUGGESTIONS).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onPick(s)}
                className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
              >
                {s}
              </button>
            ))}
          </div>
        ) : engineStatus === 'loading' ? (
          <div className="w-full text-left">
            <LoadProgressCard />
          </div>
        ) : (
          <div className="space-y-3 rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-400">
            <p>
              AI パートナーはこの端末のブラウザの中で動くローカル AI
              です（会話の内容は外部に送信されません）。クラウド
              AI（Gemini・OpenAI・Claude・OpenRouter）の API キーを登録して使うこともできます。
            </p>
            <Link href="/models">
              <Button variant="primary">
                <Sparkles />
                AI モデルを読み込む
              </Button>
            </Link>
          </div>
        )}
        <p className="text-xs text-slate-400">
          性格は「設定」で変えられます。学習記録は AI がツールで調べて答えます。
        </p>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const ready = useChat((s) => s.ready);
  const hasMessages = useChat((s) => s.messages.length > 0);
  const newChat = useChat((s) => s.newChat);
  const thread = useChat((s) => s.threads.find((t) => t.id === s.threadId));
  const helpMode = useChat((s) => s.helpMode);
  const setHelpMode = useChat((s) => s.setHelpMode);
  const personaId = useSettings((s) => s.persona);
  const custom = useSettings((s) => s.customPersona);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draft, setDraft] = useState({ text: '', n: 0 });
  const persona = getPersona(personaId, custom);

  return (
    <>
      <PageHeader
        title={thread?.title ?? `AI · ${persona.name}`}
        meta={<ModelStatusChip className="max-w-36 md:hidden" />}
        hideTitleOnMobile
        actions={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setHistoryOpen(true)}
              aria-label="チャットの履歴"
              title="チャットの履歴"
              className="lg:hidden"
            >
              <History />
              <span className="hidden sm:inline">履歴</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={newChat}
              disabled={!hasMessages}
              aria-label="新しいチャット"
              title="新しいチャット"
            >
              <SquarePen />
              <span className="hidden sm:inline">新しいチャット</span>
            </Button>
            <Button
              variant={helpMode ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setHelpMode(!helpMode)}
              aria-pressed={helpMode}
              aria-label="アプリの使い方を聞く"
              title="アプリの使い方を聞く（ヘルプをもとに答えます）"
            >
              <LifeBuoy />
              <span className="hidden sm:inline">使い方を聞く</span>
            </Button>
          </>
        }
      />
      <div className="flex min-h-0 flex-1">
        {/* PC: 左にチャットの履歴 */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 p-3 lg:flex dark:border-slate-800">
          <ThreadList />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          {!ready ? (
            <div className="flex-1" />
          ) : hasMessages ? (
            <MessageList emoji={persona.emoji} />
          ) : (
            <EmptyState onPick={(text) => setDraft((d) => ({ text, n: d.n + 1 }))} />
          )}
          <div className="shrink-0 space-y-1 pt-1">
            {helpMode && (
              <div className="mx-auto flex w-full max-w-3xl items-center gap-2 px-3 sm:px-4">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                  <LifeBuoy className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1">
                    使い方モード: アプリのヘルプから関係する部分を選んで、AI が答えます
                  </span>
                  <button
                    type="button"
                    onClick={() => setHelpMode(false)}
                    aria-label="使い方モードをやめる"
                    className="rounded-md p-0.5 hover:bg-sky-100 dark:hover:bg-sky-900/40"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
            )}
            <AttachedCard />
            <Composer key={draft.n} initialText={draft.text} />
          </div>
        </div>
      </div>
      {/* スマホ: 下から出るシートでチャットの履歴 */}
      <BottomSheet
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="チャットの履歴"
        expandable
      >
        <ThreadList onPicked={() => setHistoryOpen(false)} />
      </BottomSheet>
    </>
  );
}
