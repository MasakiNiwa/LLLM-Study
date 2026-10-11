import { ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useSettings } from '@/features/settings/settingsStore';
import { useChat } from './chatStore';
import { MessageItem } from './MessageItem';
import { useStickToBottom } from './useStickToBottom';

export function MessageList({ emoji }: { emoji: string }) {
  const messages = useChat((s) => s.messages);
  const showStats = useSettings((s) => s.showStats);
  const busy = useChat((s) => s.isGenerating);
  const { scrollRef, contentRef, atBottom, scrollToBottom } = useStickToBottom<
    HTMLDivElement,
    HTMLDivElement
  >();

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} className="h-full overflow-y-auto overscroll-contain">
        <div ref={contentRef} className="mx-auto w-full max-w-3xl space-y-5 px-3 py-5 sm:px-4">
          {messages.map((m, i) => (
            <MessageItem
              key={m.id}
              message={m}
              showStats={showStats}
              isLast={i === messages.length - 1}
              busy={busy}
              emoji={emoji}
            />
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => scrollToBottom('smooth')}
        aria-label="最新のメッセージへ"
        className={cn(
          'absolute bottom-3 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-slate-200 bg-white/95 text-slate-700 shadow-md transition-all dark:border-slate-700 dark:bg-slate-800/95 dark:text-slate-200',
          atBottom ? 'pointer-events-none translate-y-2 opacity-0' : 'opacity-100',
        )}
      >
        <ArrowDown className="size-4" />
      </button>
    </div>
  );
}
