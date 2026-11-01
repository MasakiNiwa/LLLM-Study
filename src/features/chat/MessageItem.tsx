import { lazy, memo, Suspense, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  Brain,
  Check,
  ChevronRight,
  Copy,
  Pencil,
  RotateCcw,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { ElapsedCounter } from '@/components/ui/ElapsedCounter';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import { formatDuration } from '@/lib/utils/format';
import { TOOL_LABELS } from '@/features/ai/tools';
import { useChat, type ChatMessage } from './chatStore';
import { ProposalCard } from './ProposalCard';
import { useAiReady } from '@/features/cloud/aiClient';

const Markdown = lazy(() => import('./markdown/Markdown'));

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1" aria-label="考え中">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 animate-bounce rounded-full bg-slate-400"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}

function ActionButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex size-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200/70 hover:text-slate-800 dark:hover:bg-slate-800 dark:hover:text-slate-200 [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ActionButton
      label="コピー"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          toast.error('コピーできませんでした');
        }
      }}
    >
      {copied ? <Check /> : <Copy />}
    </ActionButton>
  );
}

interface MessageItemProps {
  message: ChatMessage;
  isLast: boolean;
  busy: boolean;
  showStats: boolean;
  emoji: string;
}

/** 自分の発言。直して送り直せる（その発言から後ろは消えて、作り直す） */
function UserMessage({ message, busy }: { message: ChatMessage; busy: boolean }) {
  const editAndResend = useChat((s) => s.editAndResend);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(message.text);
  if (editing)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (editAndResend(message.id, text)) setEditing(false);
        }}
        className="ml-auto w-full max-w-[85%] space-y-2"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="発言を直す"
          rows={Math.min(8, Math.max(2, text.split('\n').length))}
          autoFocus
          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-base dark:border-slate-700 dark:bg-slate-900"
        />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            やめる
          </Button>
          <Button type="submit" size="sm" variant="primary" disabled={!text.trim() || busy}>
            送り直す
          </Button>
        </div>
      </form>
    );
  return (
    <div className="group flex flex-col items-end gap-0.5">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent-600 px-4 py-2.5 whitespace-pre-wrap text-white">
        {message.text}
        {message.context && (
          <div className="mt-1 text-[0.65rem] opacity-70" title="学習状況を AI に伝えました">
            📎 学習状況つき
          </div>
        )}
      </div>
      <div className="flex opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <CopyButton text={message.text} />
        {!busy && (
          <ActionButton
            label="直して送り直す"
            onClick={() => {
              setText(message.text);
              setEditing(true);
            }}
          >
            <Pencil />
          </ActionButton>
        )}
      </div>
    </div>
  );
}

export const MessageItem = memo(function MessageItem({
  message,
  isLast,
  busy,
  showStats,
  emoji,
}: MessageItemProps) {
  const regenerate = useChat((s) => s.regenerate);
  // モデルが読み込まれていないときは作り直せないので、ボタンを出さない
  const engineReady = useAiReady();
  const toolActivity = useChat((s) => (isLast ? s.toolActivity : null));
  const [showThought, setShowThought] = useState(false);

  if (message.role === 'user') {
    return <UserMessage message={message} busy={busy} />;
  }

  const streaming = message.status === 'streaming';
  return (
    <div className="flex gap-2.5">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
        {emoji}
      </div>
      <div className="min-w-0 flex-1 space-y-1.5">
        {message.thinking && (
          <button
            type="button"
            onClick={() => setShowThought((v) => !v)}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          >
            <Brain className="size-3.5" />
            考えた過程
            <ChevronRight
              className={cn('size-3.5 transition-transform', showThought && 'rotate-90')}
            />
          </button>
        )}
        {showThought && message.thinking && (
          <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs whitespace-pre-wrap text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
            {message.thinking}
          </div>
        )}
        {(message.tools?.length || toolActivity) && (
          <div className="flex flex-wrap gap-1">
            {[...new Set(message.tools ?? [])].map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.7rem] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              >
                <Wrench className="size-3" />
                {TOOL_LABELS[t] ?? t}
              </span>
            ))}
            {toolActivity && (
              <span className="inline-flex animate-pulse items-center gap-1 rounded-md bg-accent-50 px-1.5 py-0.5 text-[0.7rem] text-accent-700 dark:bg-accent-900/30 dark:text-accent-300">
                <Wrench className="size-3" />
                {toolActivity}中…
              </span>
            )}
          </div>
        )}
        <div className="prose-chat">
          {message.text ? (
            <Suspense fallback={<p className="whitespace-pre-wrap">{message.text}</p>}>
              <Markdown text={message.text} />
            </Suspense>
          ) : streaming ? (
            <TypingDots />
          ) : null}
        </div>
        {streaming && (
          <ElapsedCounter
            since={message.createdAt}
            label={toolActivity ? '調べています' : message.text ? '生成中' : '考え中'}
          />
        )}
        {message.proposals?.map((p, i) => (
          <ProposalCard
            key={i}
            draft={p.draft}
            added={p.added}
            onAdd={() => void useChat.getState().addProposal(message.id, i)}
          />
        ))}
        {message.status === 'error' && (
          <p className="flex items-start gap-1.5 text-sm text-rose-600 dark:text-rose-400">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            {message.error}
          </p>
        )}
        {message.status === 'cancelled' && (
          <p className="text-xs text-slate-400">（停止しました）</p>
        )}
        {!streaming && (
          <div className="flex items-center gap-0.5">
            {message.text && <CopyButton text={message.text} />}
            {isLast && !busy && engineReady && (
              <ActionButton label="もう一度生成" onClick={() => void regenerate()}>
                <RotateCcw />
              </ActionButton>
            )}
            {message.model && (
              <span
                className="ml-1 max-w-48 truncate text-[0.7rem] text-slate-400"
                title={`答えたモデル: ${message.model}`}
              >
                {message.model}
              </span>
            )}
            {showStats && message.stats && (
              <span className="ml-1 text-[0.7rem] text-slate-400 tabular-nums">
                {message.stats.provider && (
                  <span
                    className="mr-1 rounded bg-sky-100 px-1 py-px text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
                    title={`クラウド AI: ${message.stats.provider}`}
                  >
                    クラウド
                  </span>
                )}
                {formatDuration(message.stats.totalMs)}
                {message.stats.decodeTokensPerSec
                  ? ` · ${message.stats.decodeTokensPerSec.toFixed(1)} tok/s`
                  : ''}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
