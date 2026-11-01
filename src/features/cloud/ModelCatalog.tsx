/**
 * API キーごとのモデルの一覧（シート）。検索・絞り込み・並べ替えのほか、料金・入力の長さ・公開日などを出す。
 * 押すとそのモデルを使い、★ で「マイモデル」（このキーで使うモデル。選ぶ画面の先頭に出す）に入れる。
 * 一覧にないモデルは、名前を直接入れて使える。
 */
import { useMemo, useState, type FormEvent } from 'react';
import { ChevronDown, Plus, RefreshCw, Search, Star } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Select } from '@/components/ui/Select';
import type { CloudKeyId } from '@/lib/cloud/keyVault';
import type { CloudModel } from '@/lib/cloud/providers';
import { cn } from '@/lib/utils/cn';
import { keyLabel, useCloud } from './cloudStore';
import { formatPrice, formatTokens } from './modelFormat';

type Sort = 'recommended' | 'newest' | 'cheapest' | 'context' | 'name';
type FilterKey = 'mine' | 'tools' | 'free' | 'reasoning';

const SORTS: { value: Sort; label: string }[] = [
  { value: 'recommended', label: 'おすすめ順' },
  { value: 'newest', label: '新しい順' },
  { value: 'cheapest', label: '安い順' },
  { value: 'context', label: '入力が長い順' },
  { value: 'name', label: '名前順' },
];

function Badge({ tone, children }: { tone: 'teal' | 'violet' | 'amber'; children: string }) {
  const tones = {
    teal: 'bg-teal-50 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
    violet: 'bg-violet-50 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
    amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  };
  return <span className={cn('rounded px-1.5 py-0.5 text-[11px]', tones[tone])}>{children}</span>;
}

function ModelRow({
  model,
  selected,
  mine,
  onSelect,
  onToggleMine,
}: {
  model: CloudModel;
  selected: boolean;
  mine: boolean;
  onSelect: () => void;
  onToggleMine: () => void;
}) {
  const [open, setOpen] = useState(false);
  const meta = [
    // 無料は印で出すので、料金の文字は出さない
    !model.free && formatPrice(model),
    formatTokens(model.contextLength) && `入力 ${formatTokens(model.contextLength)}`,
    formatTokens(model.maxOutput) && `出力 ${formatTokens(model.maxOutput)}`,
    model.created &&
      new Date(model.created).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short' }),
  ].filter(Boolean);
  return (
    <li
      className={cn(
        'rounded-xl border',
        selected
          ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30'
          : 'border-slate-200 dark:border-slate-700',
      )}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          onClick={onSelect}
          aria-pressed={selected}
          className="min-w-0 flex-1 px-3 py-2 text-left"
        >
          <span className="block truncate text-sm font-semibold">{model.displayName}</span>
          {model.displayName !== model.id && (
            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
              {model.id}
            </span>
          )}
          <span className="mt-1 flex flex-wrap items-center gap-1">
            {model.free && <Badge tone="teal">無料</Badge>}
            {model.tools === false && <Badge tone="amber">ツール非対応</Badge>}
            {model.reasoning && <Badge tone="violet">考える</Badge>}
            {meta.length > 0 && (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {meta.join(' ・ ')}
              </span>
            )}
          </span>
        </button>
        {model.description && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label="説明を見る"
            aria-expanded={open}
            className="flex size-10 shrink-0 items-center justify-center text-slate-400"
          >
            <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
          </button>
        )}
        <button
          type="button"
          onClick={onToggleMine}
          aria-label={mine ? 'マイモデルから外す' : 'マイモデルに入れる'}
          aria-pressed={mine}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:text-amber-500"
        >
          <Star className={cn('size-4', mine && 'fill-amber-400 text-amber-500')} />
        </button>
      </div>
      {open && model.description && (
        <p className="px-3 pb-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          {model.description}
        </p>
      )}
    </li>
  );
}

export function ModelCatalog({
  keyId,
  open,
  onClose,
  value,
  onSelect,
}: {
  keyId: CloudKeyId;
  open: boolean;
  onClose: () => void;
  value: string;
  onSelect: (model: string) => void;
}) {
  const key = useCloud((s) => s.keys.find((k) => k.id === keyId));
  const catalog = useCloud((s) => s.catalogs[keyId]);
  const checking = useCloud((s) => s.checking === keyId);
  const modelsError = useCloud((s) => s.modelsError[keyId]);
  const refresh = useCloud((s) => s.refreshModels);
  const toggleMine = useCloud((s) => s.toggleMyModel);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('recommended');
  const openrouter = key?.provider === 'openrouter';
  const [filters, setFilters] = useState<FilterKey[]>(openrouter ? ['tools'] : []);
  const [custom, setCustom] = useState('');
  const mine = useMemo(() => key?.models ?? [], [key?.models]);

  const all = useMemo(() => {
    const base = catalog?.models ?? [];
    // マイモデル・使っているモデルで一覧にないもの（直接入れたもの）も出す
    const extra = [...new Set([...mine, value])]
      .filter((id) => id && !base.some((m) => m.id === id))
      .map((id): CloudModel => ({ id, displayName: id }));
    return [...extra, ...base];
  }, [catalog, mine, value]);

  const list = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const filtered = all.filter(
      (m) =>
        (!filters.includes('mine') || mine.includes(m.id)) &&
        (!filters.includes('tools') || m.tools !== false) &&
        (!filters.includes('free') || m.free) &&
        (!filters.includes('reasoning') || m.reasoning) &&
        words.every(
          (w) =>
            m.id.toLowerCase().includes(w) ||
            m.displayName.toLowerCase().includes(w) ||
            m.description?.toLowerCase().includes(w),
        ),
    );
    const order = all.map((m) => m.id);
    const price = (m: CloudModel) => (m.free ? 0 : (m.promptPrice ?? Number.POSITIVE_INFINITY));
    const sorted = [...filtered].sort((a, b) => {
      switch (sort) {
        case 'newest':
          return (b.created ?? 0) - (a.created ?? 0);
        case 'cheapest':
          return price(a) - price(b);
        case 'context':
          return (b.contextLength ?? 0) - (a.contextLength ?? 0);
        case 'name':
          return a.id.localeCompare(b.id);
        default:
          // おすすめ: マイモデル → 取得した順（会社のおすすめ・新しい順）
          return (
            Number(mine.includes(b.id)) - Number(mine.includes(a.id)) ||
            order.indexOf(a.id) - order.indexOf(b.id)
          );
      }
    });
    return sorted;
  }, [all, query, filters, sort, mine]);

  const choose = (id: string) => {
    onSelect(id);
    onClose();
  };
  const addCustom = (e: FormEvent) => {
    e.preventDefault();
    const id = custom.trim();
    if (!id) return;
    if (!mine.includes(id)) toggleMine(keyId, id);
    setCustom('');
    choose(id);
  };
  const filterChips: { key: FilterKey; label: string }[] = [
    { key: 'mine', label: `マイモデル（${mine.length}）` },
    ...(openrouter
      ? [
          { key: 'tools' as const, label: 'ツール対応' },
          { key: 'free' as const, label: '無料' },
          { key: 'reasoning' as const, label: '考える' },
        ]
      : []),
  ];

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={key ? `${keyLabel(key)} のモデル` : 'モデル'}
      expandable
      footer={
        <form onSubmit={addCustom} className="flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="一覧にないモデル名を直接入れる"
            aria-label="モデル名を直接入れる"
            spellCheck={false}
            autoCapitalize="off"
            className="h-10 min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-950"
          />
          <Button
            type="submit"
            size="icon"
            variant="secondary"
            disabled={!custom.trim()}
            aria-label="このモデルを使う"
          >
            <Plus />
          </Button>
        </form>
      }
    >
      <div className="space-y-3">
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="モデル名・説明で検索"
              aria-label="モデルを検索"
              className="h-10 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-9 text-base dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <Button
            size="icon"
            variant="secondary"
            onClick={() => void refresh(keyId)}
            disabled={checking || !key?.unlocked}
            aria-label="モデルの一覧を取り直す"
            title={key?.unlocked ? 'モデルの一覧を取り直す' : 'キーを解除すると取り直せます'}
          >
            <RefreshCw className={checking ? 'animate-spin' : undefined} />
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {filterChips.map((f) => (
            <Chip
              key={f.key}
              active={filters.includes(f.key)}
              onClick={() =>
                setFilters((cur) =>
                  cur.includes(f.key) ? cur.filter((k) => k !== f.key) : [...cur, f.key],
                )
              }
            >
              {f.label}
            </Chip>
          ))}
          <Select
            value={sort}
            onChange={setSort}
            options={SORTS}
            aria-label="並べ替え"
            className="ml-auto w-36"
          />
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {checking
            ? 'モデルの一覧を取得しています…'
            : catalog
              ? `${list.length} / ${all.length} 件（${new Date(catalog.fetchedAt).toLocaleDateString('ja-JP')} に取得）。料金は 100 万トークンあたりの 入力 / 出力（USD）。★ でマイモデルに入れると、選ぶ画面の先頭に出ます。`
              : 'モデルの一覧がまだありません。キーを解除すると取得します。'}
          {openrouter &&
            ' チャットなどでアプリの機能を使うには「ツール対応」のモデルを選んでください。'}
        </p>
        {modelsError && (
          <p className="text-sm whitespace-pre-line text-rose-600 dark:text-rose-400">
            {modelsError}
          </p>
        )}
        <ul className="space-y-1.5">
          {list.map((m) => (
            <ModelRow
              key={m.id}
              model={m}
              selected={m.id === value}
              mine={mine.includes(m.id)}
              onSelect={() => choose(m.id)}
              onToggleMine={() => toggleMine(keyId, m.id)}
            />
          ))}
        </ul>
        {!list.length && all.length > 0 && (
          <p className="py-4 text-center text-sm text-slate-500">該当するモデルがありません</p>
        )}
      </div>
    </BottomSheet>
  );
}
