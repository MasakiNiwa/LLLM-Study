import { useEffect, useState } from 'react';
import { Paperclip, X } from 'lucide-react';
import { db } from '@/lib/db/db';
import { itemTitle } from '@/lib/packs/itemText';
import { useAiFocus } from '@/features/ai/focusStore';

/** チャットに添付したカード（AI に「このカードについて」の文脈として渡す） */
export function AttachedCard() {
  const cardId = useAiFocus((s) => s.attachedCardId);
  const attach = useAiFocus((s) => s.attach);
  const [loaded, setLoaded] = useState<{ cardId: string; title: string | null } | null>(null);
  const title = loaded && loaded.cardId === cardId ? loaded.title : null;

  useEffect(() => {
    let cancelled = false;
    if (!cardId) return;
    void (async () => {
      const card = await db.cards.get(cardId);
      const item = card && (await db.items.get(card.itemKey));
      if (!cancelled) setLoaded({ cardId, title: item ? itemTitle(item.item) : null });
    })();
    return () => {
      cancelled = true;
    };
  }, [cardId]);

  if (!cardId || !title) return null;
  return (
    <div className="mx-auto flex w-full max-w-3xl px-3 sm:px-4">
      <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent-50 py-1 pr-1 pl-3 text-xs text-accent-800 dark:bg-accent-900/30 dark:text-accent-200">
        <Paperclip className="size-3.5 shrink-0" />
        <span className="truncate">「{title}」について話しています</span>
        <button
          type="button"
          onClick={() => attach(null)}
          aria-label="添付を外す"
          className="rounded-full p-0.5 hover:bg-accent-100 dark:hover:bg-accent-900/60"
        >
          <X className="size-3.5" />
        </button>
      </span>
    </div>
  );
}
