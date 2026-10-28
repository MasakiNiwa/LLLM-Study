/**
 * OpenRouter のモデルを選ぶシート。モデルが数百あるので、検索・絞り込み（無料・ツール対応・考える）・
 * ★（お気に入り）・最近使ったものを用意する。
 */
import { useMemo, useState } from 'react';
import { RefreshCw, Search, Star } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { formatOpenRouterPrice, type OpenRouterModel } from '@/lib/cloud/openrouter';
import { cn } from '@/lib/utils/cn';
import { useSettings } from '@/features/settings/settingsStore';
import { parseRecent, useCloud } from './cloudStore';

type FilterKey = 'free' | 'tools' | 'reasoning';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'tools', label: 'ツール対応' },
  { key: 'free', label: '無料' },
  { key: 'reasoning', label: '考える' },
];

function formatContext(n: number): string {
  if (!n) return '';
  return n >= 1_000_000 ? `${Math.round(n / 100_000) / 10}M` : `${Math.round(n / 1000)}K`;
}

function Badge({
  tone,
  children,
}: {
  tone: 'teal' | 'slate' | 'violet' | 'amber';
  children: string;
}) {
  const tones = {
    teal: 'bg-teal-50 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    violet: 'bg-violet-50 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200',
    amber: 'bg-amber-50 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  };
  return <span className={cn('rounded px-1.5 py-0.5 text-[11px]', tones[tone])}>{children}</span>;
}

function ModelRow({
  model,
  selected,
  favorite,
  onSelect,
  onToggleFavorite,
}: {
  model: OpenRouterModel;
  selected: boolean;
  favorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <li
      className={cn(
        'flex items-start gap-1 rounded-xl border',
        selected
          ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/30'
          : 'border-slate-200 dark:border-slate-700',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="min-w-0 flex-1 px-3 py-2 text-left"
      >
        <span className="block truncate text-sm font-semibold">{model.displayName}</span>
        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
          {model.id}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-1">
          {model.free && <Badge tone="teal">無料</Badge>}
          {!model.tools && <Badge tone="amber">ツール非対応</Badge>}
          {model.reasoning && <Badge tone="violet">考える</Badge>}
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {!model.free && formatOpenRouterPrice(model)}
            {!model.free && model.promptPrice !== null && '（100万トークン 入力/出力）'}
            {model.contextLength > 0 &&
              `${model.free ? '' : ' ・ '}${formatContext(model.contextLength)}`}
          </span>
        </span>
      </button>
      <button
        type="button"
        onClick={onToggleFavorite}
        aria-label={favorite ? 'お気に入りから外す' : 'お気に入りに追加'}
        aria-pressed={favorite}
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-slate-400 hover:text-amber-500"
      >
        <Star className={cn('size-4', favorite && 'fill-amber-400 text-amber-500')} />
      </button>
    </li>
  );
}

export function OpenRouterBrowser({
  open,
  onClose,
  value,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  value: string;
  onSelect: (id: string) => void;
}) {
  const models = useCloud((s) => s.models.openrouter) as OpenRouterModel[];
  const checking = useCloud((s) => s.checking === 'openrouter');
  const modelsError = useCloud((s) => s.modelsError.openrouter);
  const refresh = useCloud((s) => s.refreshModels);
  const favorites = useSettings((s) => s.openrouterFavorites);
  const recents = useSettings((s) => s.recentCloudModels);
  const update = useSettings((s) => s.update);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<FilterKey[]>(['tools']);

  const filtered = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return models.filter(
      (m) =>
        (!filters.includes('free') || m.free) &&
        (!filters.includes('tools') || m.tools) &&
        (!filters.includes('reasoning') || m.reasoning) &&
        words.every(
          (w) => m.id.toLowerCase().includes(w) || m.displayName.toLowerCase().includes(w),
        ),
    );
  }, [models, query, filters]);
  const byId = useMemo(() => new Map(filtered.map((m) => [m.id, m])), [filtered]);
  const pinned = favorites.map((id) => byId.get(id)).filter((m) => !!m);
  const recent = recents
    .map(parseRecent)
    .filter((r) => r?.provider === 'openrouter' && !favorites.includes(r.model))
    .map((r) => byId.get(r!.model))
    .filter((m) => !!m);
  const groups = useMemo(() => {
    const map = new Map<string, OpenRouterModel[]>();
    for (const m of filtered) map.set(m.vendor, [...(map.get(m.vendor) ?? []), m]);
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([v, ms]) =>
          [v, [...ms].sort((a, b) => a.displayName.localeCompare(b.displayName))] as const,
      );
  }, [filtered]);

  const toggleFavorite = (id: string) =>
    update({
      openrouterFavorites: favorites.includes(id)
        ? favorites.filter((f) => f !== id)
        : [...favorites, id],
    });
  const choose = (id: string) => {
    onSelect(id);
    onClose();
  };
  const row = (m: OpenRouterModel, key: string) => (
    <ModelRow
      key={key}
      model={m}
      selected={m.id === value}
      favorite={favorites.includes(m.id)}
      onSelect={() => choose(m.id)}
      onToggleFavorite={() => toggleFavorite(m.id)}
    />
  );
  const section = (title: string, list: OpenRouterModel[], prefix: string) =>
    list.length > 0 && (
      <section key={prefix} className="space-y-1.5">
        <h3 className="text-xs font-semibold text-slate-500 dark:text-slate-400">{title}</h3>
        <ul className="space-y-1.5">{list.map((m) => row(m, `${prefix}-${m.id}`))}</ul>
      </section>
    );

  return (
    <BottomSheet open={open} onClose={onClose} title="OpenRouter のモデルを選ぶ" expandable>
      <div className="space-y-3">
        <div className="flex gap-2">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="モデル名で検索（例: gemini flash）"
              aria-label="モデルを検索"
              className="h-10 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-9 text-base dark:border-slate-700 dark:bg-slate-950"
            />
          </label>
          <Button
            size="icon"
            variant="secondary"
            onClick={() => void refresh('openrouter')}
            disabled={checking}
            aria-label="モデルの一覧を取り直す"
          >
            <RefreshCw className={checking ? 'animate-spin' : undefined} />
          </Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
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
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {models.length
            ? `${filtered.length} / ${models.length} 件。チャットなどでアプリの機能を使うには「ツール対応」のモデルを選んでください。`
            : checking
              ? 'モデルの一覧を取得しています…'
              : 'モデルの一覧がまだありません。キーを解除すると取得します。'}
        </p>
        {modelsError && (
          <p className="text-sm whitespace-pre-line text-rose-600 dark:text-rose-400">
            {modelsError}
          </p>
        )}
        {section('★ お気に入り', pinned, 'fav')}
        {section('最近使ったモデル', recent, 'recent')}
        {groups.map(([vendor, list]) => section(vendor, [...list], `v-${vendor}`))}
      </div>
    </BottomSheet>
  );
}
