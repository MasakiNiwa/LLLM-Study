import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, Pencil, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Switch } from '@/components/ui/Switch';
import { db } from '@/lib/db/db';
import type { ItemRecord } from '@/lib/db/types';
import {
  resetPackProgress,
  setPackEnabled,
  setPackTemplates,
  uninstallPack,
} from '@/lib/packs/install';
import { itemAnswer, itemSearchText, itemTitle } from '@/lib/packs/itemText';
import type { ItemType, StudyItem } from '@/lib/packs/schema';
import { ITEM_TYPE_LABELS, TEMPLATES } from '@/lib/packs/templates';
import { cn } from '@/lib/utils/cn';
import { errorMessage } from '@/lib/utils/format';
import { CardEditor } from './CardEditor';
import { useLibrary, type PackWithStats } from './libraryStore';

function StatsBar({ pack }: { pack: PackWithStats }) {
  const { cards, newCards, learning, review } = pack.stats;
  const pct = (n: number) => `${cards ? (n / cards) * 100 : 0}%`;
  return (
    <div className="space-y-1">
      <div className="flex h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
        <div className="bg-emerald-500" style={{ width: pct(review) }} />
        <div className="bg-amber-400" style={{ width: pct(learning) }} />
      </div>
      <div className="flex flex-wrap gap-x-3 text-xs text-slate-500 dark:text-slate-400">
        <span>カード {cards}</span>
        <span className="text-emerald-700 dark:text-emerald-400">定着 {review}</span>
        <span className="text-amber-700 dark:text-amber-400">学習中 {learning}</span>
        <span>未学習 {newCards}</span>
      </div>
    </div>
  );
}

function ItemBrowser({
  packId,
  version,
  onEdit,
}: {
  packId: string;
  /** パックが更新されたら読み直す */
  version: number;
  /** 指定すると項目をタップして編集できる（マイカード） */
  onEdit?: (item: StudyItem) => void;
}) {
  const [items, setItems] = useState<ItemRecord[] | null>(null);
  const [query, setQuery] = useState('');
  useEffect(() => {
    void db.items.where('packId').equals(packId).sortBy('order').then(setItems);
  }, [packId, version]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? []).filter((i) => !q || itemSearchText(i.item).includes(q)).slice(0, 200);
  }, [items, query]);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="項目を検索"
          className="h-9 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-9 text-sm dark:border-slate-700 dark:bg-slate-950"
        />
      </div>
      <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {filtered.map((i) => (
          <li key={i.key} className="text-sm">
            {onEdit ? (
              <button
                type="button"
                onClick={() => onEdit(i.item)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{itemTitle(i.item)}</span>
                  <span className="block truncate text-xs text-slate-500">
                    {itemAnswer(i.item)}
                  </span>
                </span>
                <Pencil className="size-4 shrink-0 text-slate-400" />
              </button>
            ) : (
              <div className="px-3 py-2">
                <div className="truncate font-medium">{itemTitle(i.item)}</div>
                <div className="truncate text-xs text-slate-500">{itemAnswer(i.item)}</div>
              </div>
            )}
          </li>
        ))}
        {items && filtered.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-slate-500">見つかりません</li>
        )}
      </ul>
    </div>
  );
}

function PackCard({ pack, onEdit }: { pack: PackWithStats; onEdit: (item: StudyItem) => void }) {
  const refresh = useLibrary((s) => s.refresh);
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | 'reset' | 'delete'>(null);

  const run = async (fn: () => Promise<void>, done: string) => {
    try {
      await fn();
      toast.success(done);
    } catch (e) {
      toast.error('操作に失敗しました', { description: errorMessage(e) });
    }
    void refresh();
  };

  const toggleTemplate = (type: ItemType, id: string, on: boolean) => {
    const current = pack.templates[type] ?? [];
    const next = on ? [...new Set([...current, id])] : current.filter((t) => t !== id);
    if (next.length === 0) {
      toast.info('少なくとも 1 つは選んでください');
      return;
    }
    void run(
      () => setPackTemplates(pack.id, { ...pack.templates, [type]: next }),
      on ? 'カードを追加しました' : 'カードを外しました（そのカードの学習記録も削除しました）',
    );
  };

  return (
    <Card className={cn('overflow-hidden', !pack.enabled && 'opacity-70')}>
      <div className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div>
            <div className="font-semibold">{pack.title}</div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {pack.itemCount} 項目 · {pack.itemTypes.map((t) => ITEM_TYPE_LABELS[t]).join('・')}
              {pack.origin === 'sample' && ' · サンプル'}
              {pack.origin === 'user' && ' · 自分で作ったカード'}
            </div>
          </div>
          <StatsBar pack={pack} />
        </div>
        <Switch
          checked={pack.enabled}
          onChange={(v) =>
            void run(
              () => setPackEnabled(pack.id, v),
              v ? '学習の対象にしました' : '学習の対象から外しました',
            )
          }
          label={`${pack.title} を学習する`}
        />
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-center gap-1 border-t border-slate-100 py-2 text-xs text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
      >
        詳細
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-slate-100 p-4 dark:border-slate-800">
          {pack.description && (
            <p className="text-sm text-slate-600 dark:text-slate-400">{pack.description}</p>
          )}
          <div className="space-y-2">
            <h3 className="text-sm font-medium">出題のしかた</h3>
            {pack.itemTypes.map((type) => (
              <div key={type} className="space-y-1">
                {pack.itemTypes.length > 1 && (
                  <div className="text-xs text-slate-500">{ITEM_TYPE_LABELS[type]}</div>
                )}
                {TEMPLATES[type].map((t) => (
                  <label key={t.id} className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 size-4 accent-accent-600"
                      checked={(pack.templates[type] ?? []).includes(t.id)}
                      onChange={(e) => toggleTemplate(type, t.id, e.target.checked)}
                    />
                    <span>
                      {t.label}
                      <span className="block text-xs text-slate-500">{t.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-medium">項目</h3>
            <ItemBrowser
              packId={pack.id}
              version={pack.updatedAt}
              onEdit={pack.origin === 'user' ? onEdit : undefined}
            />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {pack.level && <span>レベル: {pack.level}</span>}
            {pack.source && <span>出典: {pack.source}</span>}
            {pack.license && <span>ライセンス: {pack.license}</span>}
            <span className="font-mono">id: {pack.id}</span>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setConfirm('reset')}>
              <RotateCcw />
              最初からやり直す
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-rose-600"
              onClick={() => setConfirm('delete')}
            >
              <Trash2 />
              削除
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirm === 'reset'}
        title="学習記録をリセットしますか？"
        description={`「${pack.title}」の学習記録をすべて消して、未学習の状態に戻します。`}
        confirmLabel="リセット"
        danger
        onConfirm={() => void run(() => resetPackProgress(pack.id), '学習記録をリセットしました')}
        onClose={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="教材を削除しますか？"
        description={`「${pack.title}」と、その学習記録をすべて削除します。この操作は取り消せません。`}
        confirmLabel="削除"
        danger
        onConfirm={() => void run(() => uninstallPack(pack.id), '教材を削除しました')}
        onClose={() => setConfirm(null)}
      />
    </Card>
  );
}

/** 取り込んだ教材の一覧 */
export function PackList({ empty }: { empty: React.ReactNode }) {
  const packs = useLibrary((s) => s.packs);
  const loaded = useLibrary((s) => s.loaded);
  const [editor, setEditor] = useState<{ item: StudyItem | null } | null>(null);
  if (!loaded) return null;
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => setEditor({ item: null })}>
          <Plus />
          カードを作る
        </Button>
      </div>
      {packs.length === 0
        ? empty
        : packs.map((p) => <PackCard key={p.id} pack={p} onEdit={(item) => setEditor({ item })} />)}
      <CardEditor open={editor !== null} editing={editor?.item} onClose={() => setEditor(null)} />
    </div>
  );
}
