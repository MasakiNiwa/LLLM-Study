import { Check, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { UserItemDraft } from '@/lib/packs/userPack';
import { ITEM_TYPE_LABELS } from '@/lib/packs/templates';

function headOf(d: UserItemDraft): { front: string; back: string } {
  switch (d.type) {
    case 'vocab':
      return { front: d.term, back: d.meanings.join('、') };
    case 'phrase':
      return { front: d.phrase, back: d.meaning };
    case 'qa':
      return { front: d.question, back: d.answer };
    default:
      return { front: '', back: '' };
  }
}

/** AI が提案したカード。ユーザーが確認して「追加」を押したときだけマイカードに保存する */
export function ProposalCard({
  draft,
  added,
  onAdd,
}: {
  draft: UserItemDraft;
  added?: boolean;
  onAdd: () => void;
}) {
  const { front, back } = headOf(draft);
  const example = 'examples' in draft ? draft.examples?.[0] : undefined;
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-accent-200 bg-accent-50/60 p-3 dark:border-accent-900 dark:bg-accent-900/20">
      <div className="min-w-0 flex-1 text-sm">
        <div className="text-[0.7rem] font-medium text-accent-700 dark:text-accent-300">
          カードの提案 · {ITEM_TYPE_LABELS[draft.type]}
        </div>
        <div className="font-semibold break-words">{front}</div>
        <div className="text-slate-600 dark:text-slate-300">{back}</div>
        {example && (
          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {example.text}
            {example.translation && ` — ${example.translation}`}
          </div>
        )}
      </div>
      <Button size="sm" variant={added ? 'ghost' : 'primary'} disabled={added} onClick={onAdd}>
        {added ? <Check /> : <Plus />}
        {added ? '追加済み' : '追加'}
      </Button>
    </div>
  );
}
