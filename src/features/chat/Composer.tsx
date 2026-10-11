import { useRef, useState, type KeyboardEvent } from 'react';
import { ArrowUp, Square } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils/cn';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings } from '@/features/settings/settingsStore';
import { useChat } from './chatStore';

/** タッチ主体の端末では Enter は改行にする */
const isCoarsePointer = () => matchMedia('(pointer: coarse)').matches;

/** initialText: 提案のチップなどから入れる文（変えるときは key を変えて作り直す） */
export function Composer({ initialText = '' }: { initialText?: string }) {
  const [text, setText] = useState(initialText);
  const ref = useRef<HTMLTextAreaElement>(null);
  const isGenerating = useChat((s) => s.isGenerating);
  const send = useChat((s) => s.send);
  const stop = useChat((s) => s.stop);
  const ready = useEngine((s) => s.status === 'ready');
  const enterToSend = useSettings((s) => s.enterToSend);

  const canSend = ready && !isGenerating && text.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    void send(text);
    setText('');
    // スマホではキーボードを閉じずにそのまま次を打てるようにフォーカスを維持
    ref.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME 変換中の Enter は送信しない（日本語入力対策）
    if (e.key !== 'Enter' || e.nativeEvent.isComposing || e.keyCode === 229) return;
    const modifier = e.ctrlKey || e.metaKey;
    if (modifier || (enterToSend && !e.shiftKey && !isCoarsePointer())) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="shrink-0 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent px-3 pt-2 pb-3 sm:px-4 dark:from-slate-950 dark:via-slate-950">
      <form
        className="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-3xl border border-slate-300 bg-white p-1.5 pl-4 shadow-sm transition-colors focus-within:border-accent-500 dark:border-slate-700 dark:bg-slate-900"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={ref}
          autoFocus={initialText !== ''}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder={ready ? 'AI に話しかける…' : 'まず AI モデルを読み込んでください'}
          enterKeyHint={enterToSend ? 'send' : 'enter'}
          aria-label="メッセージ"
          className="max-h-48 min-h-10 flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none [field-sizing:content] placeholder:text-slate-400 focus-visible:outline-none"
        />
        {isGenerating ? (
          <Button
            variant="secondary"
            size="icon"
            onClick={stop}
            aria-label="生成を停止"
            title="停止"
            className="rounded-full"
          >
            <Square className="fill-current" />
          </Button>
        ) : (
          <Button
            type="submit"
            variant="primary"
            size="icon"
            disabled={!canSend}
            aria-label="送信"
            title="送信"
            className={cn('rounded-full', !canSend && 'shadow-none')}
          >
            <ArrowUp />
          </Button>
        )}
      </form>
    </div>
  );
}
