import { lazy, memo, Suspense, useState, type ReactNode } from 'react';
import { AlertCircle, Brain, Check, ChevronRight, Copy, RotateCcw, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { formatDuration } from '@/lib/utils/format';
import { TOOL_LABELS } from '@/features/ai/tools';
import { useChat, type ChatMessage } from './chatStore';

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

export const MessageItem = memo(function MessageItem({
  message,
  isLast,
  busy,
  showStats,
  emoji,
}: MessageItemProps) {
  const regenerate = useChat((s) => s.regenerate);
  const toolActivity = useChat((s) => (isLast ? s.toolActivity : null));
  const [showThought, setShowThought] = useState(false);

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent-600 px-4 py-2.5 whitespace-pre-wrap text-white">
          {message.text}
          {message.context && (
            <div className="mt-1 text-[0.65rem] opacity-70" title="学習状況を AI に伝えました">
              📎 学習状況つき
            </div>
          )}
        </div>
      </div>
    );
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
            {isLast && !busy && (
              <ActionButton label="もう一度生成" onClick={() => void regenerate()}>
                <RotateCcw />
              </ActionButton>
            )}
            {showStats && message.stats && (
              <span className="ml-1 text-[0.7rem] text-slate-400 tabular-nums">
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
