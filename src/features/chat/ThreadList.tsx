/**
 * チャットの履歴（スレッドの一覧）。PC はチャット画面の左、スマホは下から出るシートで出す。
 * 日付ごと（今日・昨日・7 日以内・それより前）に並べ、名前の変更と削除ができる。
 */
import { useState } from 'react';
import { Check, MessageSquare, Pencil, SquarePen, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { ThreadRecord } from '@/lib/db/types';
import { cn } from '@/lib/utils/cn';
import { useChat } from './chatStore';

const DAY = 86_400_000;

function groupLabel(ts: number, now = Date.now()): string {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const start = today.getTime();
  if (ts >= start) return '今日';
  if (ts >= start - DAY) return '昨日';
  if (ts >= start - 6 * DAY) return '7 日以内';
  if (ts >= start - 29 * DAY) return '30 日以内';
  return 'それより前';
}

function ThreadItem({
  thread,
  active,
  onPick,
  onDelete,
}: {
  thread: ThreadRecord;
  active: boolean;
  onPick: () => void;
  onDelete: () => void;
}) {
  const rename = useChat((s) => s.renameThread);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(thread.title);
  if (editing)
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void rename(thread.id, title);
          setEditing(false);
        }}
        className="flex items-center gap-1 px-1 py-0.5"
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="チャットの名前"
          maxLength={60}
          autoFocus
          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-base dark:border-slate-700 dark:bg-slate-950"
        />
        <Button type="submit" size="icon" variant="ghost" aria-label="名前を保存">
          <Check />
        </Button>
        <Button size="icon" variant="ghost" aria-label="やめる" onClick={() => setEditing(false)}>
          <X />
        </Button>
      </form>
    );
  return (
    <div
      className={cn(
        'group flex items-center rounded-lg',
        active
          ? 'bg-accent-50 dark:bg-accent-900/30'
          : 'hover:bg-slate-100 dark:hover:bg-slate-800/60',
      )}
    >
      <button
        type="button"
        onClick={onPick}
        aria-current={active ? 'true' : undefined}
        title={thread.title}
        className="min-w-0 flex-1 truncate px-2.5 py-2 text-left text-sm"
      >
        {thread.title}
      </button>
      <div className="flex shrink-0 opacity-100 transition-opacity md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <button
          type="button"
          onClick={() => {
            setTitle(thread.title);
            setEditing(true);
          }}
          aria-label={`「${thread.title}」の名前を変える`}
          className="flex size-8 items-center justify-center rounded-md text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`「${thread.title}」を削除`}
          className="flex size-8 items-center justify-center rounded-md text-slate-500 hover:text-rose-600"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

export function ThreadList({ onPicked }: { onPicked?: () => void }) {
  const threads = useChat((s) => s.threads);
  const current = useChat((s) => s.threadId);
  const newChat = useChat((s) => s.newChat);
  const openThread = useChat((s) => s.openThread);
  const deleteThread = useChat((s) => s.deleteThread);
  const clear = useChat((s) => s.clear);
  const [deleting, setDeleting] = useState<ThreadRecord | null>(null);
  const [clearing, setClearing] = useState(false);

  const groups: { label: string; items: ThreadRecord[] }[] = [];
  for (const t of threads) {
    const label = groupLabel(t.updatedAt);
    const last = groups[groups.length - 1];
    if (last?.label === label) last.items.push(t);
    else groups.push({ label, items: [t] });
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <Button
        variant="secondary"
        onClick={() => {
          newChat();
          onPicked?.();
        }}
      >
        <SquarePen />
        新しいチャット
      </Button>
      <nav aria-label="チャットの履歴" className="min-h-0 flex-1 space-y-3 overflow-y-auto">
        {threads.length === 0 && (
          <p className="flex items-center gap-1.5 px-2.5 py-2 text-xs text-slate-500">
            <MessageSquare className="size-3.5" />
            まだ履歴はありません
          </p>
        )}
        {groups.map((g) => (
          <section key={g.label} className="space-y-0.5">
            <h3 className="px-2.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {g.label}
            </h3>
            {g.items.map((t) => (
              <ThreadItem
                key={t.id}
                thread={t}
                active={t.id === current}
                onPick={() => {
                  void openThread(t.id);
                  onPicked?.();
                }}
                onDelete={() => setDeleting(t)}
              />
            ))}
          </section>
        ))}
      </nav>
      {threads.length > 0 && (
        <button
          type="button"
          onClick={() => setClearing(true)}
          className="px-2.5 py-1 text-left text-xs text-slate-500 underline hover:text-rose-600"
        >
          すべての履歴を削除
        </button>
      )}
      <ConfirmDialog
        open={deleting !== null}
        title={deleting ? `「${deleting.title}」を削除しますか？` : ''}
        description="このチャットの発言をすべて削除します。学習記録やモデルはそのままです。"
        confirmLabel="削除"
        danger
        onConfirm={() => {
          if (deleting) void deleteThread(deleting.id);
          setDeleting(null);
        }}
        onClose={() => setDeleting(null)}
      />
      <ConfirmDialog
        open={clearing}
        title="すべてのチャットの履歴を削除しますか？"
        description="すべてのチャットを削除します。学習記録やモデルはそのままです。"
        confirmLabel="すべて削除"
        danger
        onConfirm={() => {
          void clear();
          setClearing(false);
        }}
        onClose={() => setClearing(false)}
      />
    </div>
  );
}
