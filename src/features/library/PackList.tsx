import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  FileDown,
  Play,
  Plus,
  RotateCcw,
  Search,
  Trash2,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Switch } from '@/components/ui/Switch';
import { db } from '@/lib/db/db';
import {
  movePack,
  resetPackProgress,
  setPackEnabled,
  setPackTemplates,
  uninstallPack,
} from '@/lib/packs/install';
import type { ItemType, StudyItem } from '@/lib/packs/schema';
import { subjectKey, subjectLabel } from '@/lib/packs/subjects';
import { ITEM_TYPE_LABELS, TEMPLATES } from '@/lib/packs/templates';
import { Select } from '@/components/ui/Select';
import { useSettings } from '@/features/settings/settingsStore';
import { useStudy } from '@/features/study/studyStore';
import { cn } from '@/lib/utils/cn';
import { errorMessage } from '@/lib/utils/format';
import { dataWorker } from '@/lib/data/client';
import { exportPack } from '@/lib/packs/exportPack';
import { downloadText } from '@/lib/utils/download';
import type { ItemSummary } from '@/lib/data/stats';
import { setItemSuspended } from '@/features/study/cardActions';
import { CardEditor } from './CardEditor';
import { ItemRow } from './ItemRow';
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
  /** 指定すると項目を編集できる（マイカード） */
  onEdit?: (item: StudyItem) => void;
}) {
  const [items, setItems] = useState<ItemSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    void dataWorker()
      .packItems(packId)
      .then((r) => !cancelled && setItems(r));
    return () => {
      cancelled = true;
    };
  }, [packId, version, reload]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items ?? [])
      .filter((i) => !q || `${i.title} ${i.answer}`.toLowerCase().includes(q))
      .slice(0, 300);
  }, [items, query]);

  const toggle = async (item: ItemSummary) => {
    await setItemSuspended(item.key, item.status !== 'suspended');
    setReload((n) => n + 1);
    void useLibrary.getState().refresh();
  };
  const edit = async (key: string) => {
    const rec = await db.items.get(key);
    if (rec) onEdit?.(rec.item);
  };

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
      <ul className="max-h-80 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {filtered.map((i) => (
          <ItemRow
            key={i.key}
            item={i}
            onToggleSuspend={() => void toggle(i)}
            onEdit={onEdit ? () => void edit(i.key) : undefined}
          />
        ))}
        {items && filtered.length === 0 && (
          <li className="px-3 py-4 text-center text-sm text-slate-500">見つかりません</li>
        )}
      </ul>
    </div>
  );
}

/** すべての教材から項目を探した結果 */
function GlobalItemSearch({ query }: { query: string }) {
  const packs = useLibrary((s) => s.packs);
  const [result, setResult] = useState<{ q: string; items: ItemSummary[] } | null>(null);
  const [reload, setReload] = useState(0);
  const q = query.trim();
  useEffect(() => {
    if (!q) return;
    let cancelled = false;
    const t = setTimeout(() => {
      void dataWorker()
        .searchItems(q, 50)
        .then((items) => !cancelled && setResult({ q, items }));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, reload]);
  if (!q || result?.q !== q || result.items.length === 0) return null;
  const titleOf = new Map(packs.map((p) => [p.id, p.title]));
  return (
    <div className="space-y-1.5">
      <h3 className="px-1 text-sm font-medium text-slate-500 dark:text-slate-400">
        項目の検索結果（{result.items.length >= 50 ? '50 件以上' : `${result.items.length} 件`}）
      </h3>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
        {result.items.map((i) => (
          <ItemRow
            key={i.key}
            item={i}
            packTitle={titleOf.get(i.packId)}
            onToggleSuspend={() =>
              void setItemSuspended(i.key, i.status !== 'suspended').then(() =>
                setReload((n) => n + 1),
              )
            }
          />
        ))}
      </ul>
    </div>
  );
}

function PackCard({
  pack,
  onEdit,
  first,
  last,
}: {
  pack: PackWithStats;
  onEdit: (item: StudyItem) => void;
  /** 並び順で先頭・末尾か（上へ・下へボタンの無効化） */
  first: boolean;
  last: boolean;
}) {
  const refresh = useLibrary((s) => s.refresh);
  const focused = useSettings((s) => s.focusPackId === pack.id);
  const [, navigate] = useLocation();

  /** この教材だけを学習する（学習中のセッションは新しい条件で始め直す） */
  const studyThis = () => {
    useSettings.getState().update({ focusPackId: pack.id });
    useStudy.getState().end();
    navigate('/study');
  };
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
            <div className="font-semibold">
              {pack.title}
              {focused && (
                <span className="ml-2 rounded-md bg-accent-100 px-1.5 py-0.5 align-middle text-[0.7rem] font-medium text-accent-800 dark:bg-accent-900/40 dark:text-accent-200">
                  学習中の教材
                </span>
              )}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {subjectLabel(subjectKey(pack.subject))} · {pack.itemCount} 項目 ·{' '}
              {pack.itemTypes.map((t) => ITEM_TYPE_LABELS[t]).join('・')}
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
      <div className="flex items-center gap-2 px-4 pb-3">
        <Button size="sm" variant={focused ? 'primary' : 'secondary'} onClick={studyThis}>
          <Play />
          この教材を学習
        </Button>
        {pack.stats.due > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            復習 {pack.stats.due} 枚
          </span>
        )}
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
            <Button
              size="sm"
              variant="ghost"
              disabled={first}
              onClick={() => void run(() => movePack(pack.id, -1), '並び順を変えました')}
              aria-label="上へ"
              title="上へ（新しいカードを先に出す）"
            >
              <ArrowUp />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={last}
              onClick={() => void run(() => movePack(pack.id, 1), '並び順を変えました')}
              aria-label="下へ"
              title="下へ"
            >
              <ArrowDown />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                try {
                  const data = await exportPack(pack.id);
                  downloadText(
                    `${pack.id}.json`,
                    JSON.stringify(data, null, 2),
                    'application/json',
                  );
                } catch (e) {
                  toast.error('書き出せませんでした', { description: errorMessage(e) });
                }
              }}
              title="教材パック形式（JSON）で書き出す。共有や、外部 AI に続きを作ってもらうのに使えます"
            >
              <FileDown />
              書き出す
            </Button>
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

type SortKey = 'order' | 'name' | 'due' | 'new' | 'recent';

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'order', label: '並び順' },
  { value: 'name', label: '名前' },
  { value: 'due', label: '復習が多い順' },
  { value: 'new', label: '未学習が多い順' },
  { value: 'recent', label: '追加・更新が新しい順' },
];

function sortPacks(packs: PackWithStats[], key: SortKey): PackWithStats[] {
  const list = [...packs];
  switch (key) {
    case 'name':
      return list.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
    case 'due':
      return list.sort((a, b) => b.stats.due - a.stats.due || a.order - b.order);
    case 'new':
      return list.sort((a, b) => b.stats.newCards - a.stats.newCards || a.order - b.order);
    case 'recent':
      return list.sort((a, b) => b.updatedAt - a.updatedAt);
    default:
      return list.sort((a, b) => a.order - b.order);
  }
}

/** 取り込んだ教材の一覧（検索・分野での絞り込み・並べ替え） */
export function PackList({ empty }: { empty: React.ReactNode }) {
  const packs = useLibrary((s) => s.packs);
  const loaded = useLibrary((s) => s.loaded);
  const [editor, setEditor] = useState<{ item: StudyItem | null } | null>(null);
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>('order');

  const subjects = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of packs)
      counts.set(subjectKey(p.subject), (counts.get(subjectKey(p.subject)) ?? 0) + 1);
    return [...counts.entries()];
  }, [packs]);

  const ordered = useMemo(() => sortPacks(packs, 'order'), [packs]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = packs.filter(
      (p) =>
        (!subject || subjectKey(p.subject) === subject) &&
        (!q ||
          [p.title, p.description, p.level, ...(p.tags ?? [])]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
            .includes(q)),
    );
    return sortPacks(filtered, sort);
  }, [packs, query, subject, sort]);

  if (!loaded) return null;
  const showTools = packs.length >= 2;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {packs.length > 0 && (
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="教材・項目を検索"
              aria-label="教材を検索"
              className="h-10 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-9 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
        )}
        <Button
          size="sm"
          variant="secondary"
          className="ml-auto"
          onClick={() => setEditor({ item: null })}
        >
          <Plus />
          カードを作る
        </Button>
      </div>
      {showTools && (
        <div className="flex flex-wrap items-center gap-2">
          {subjects.length >= 2 &&
            [null, ...subjects.map(([k]) => k)].map((k) => (
              <button
                key={k ?? 'all'}
                type="button"
                aria-pressed={subject === k}
                onClick={() => setSubject(k)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  subject === k
                    ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-900/30 dark:text-accent-200'
                    : 'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800',
                )}
              >
                {k === null ? 'すべて' : subjectLabel(k)}
              </button>
            ))}
          <Select
            value={sort}
            onChange={setSort}
            options={SORT_OPTIONS}
            aria-label="並べ替え"
            className="ml-auto w-44"
          />
        </div>
      )}
      {packs.length === 0
        ? empty
        : visible.map((p) => (
            <PackCard
              key={p.id}
              pack={p}
              first={ordered[0]?.id === p.id}
              last={ordered[ordered.length - 1]?.id === p.id}
              onEdit={(item) => setEditor({ item })}
            />
          ))}
      {packs.length > 0 && visible.length === 0 && !query.trim() && (
        <p className="py-4 text-center text-sm text-slate-500">条件に合う教材がありません</p>
      )}
      <GlobalItemSearch query={query} />
      <CardEditor open={editor !== null} editing={editor?.item} onClose={() => setEditor(null)} />
    </div>
  );
}
