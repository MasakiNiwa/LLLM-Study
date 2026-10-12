import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, Download, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { fetchSampleIndex, type SampleEntry } from '@/lib/packs/samples';
import {
  countSubjectGroups,
  subjectGroupKey,
  subjectGroupLabel,
  subjectKey,
  subjectLabel,
} from '@/lib/packs/subjects';
import { ITEM_TYPE_LABELS } from '@/lib/packs/templates';
import { errorMessage } from '@/lib/utils/format';
import { installSample } from './packActions';
import { useLibrary } from './libraryStore';
import { SearchBox, SubjectChips } from './ListFilters';
import { matchesQuery } from './listFilter';

type SampleSort = 'default' | 'name' | 'items' | 'new';

/** はじめての案内など狭い場所で、最初に見せる数（残りは「もっと見る」で開く） */
const COMPACT_LIMIT = 6;

const SORT_OPTIONS: { value: SampleSort; label: string }[] = [
  { value: 'default', label: 'おすすめ順' },
  { value: 'new', label: '未追加・更新を先に' },
  { value: 'name', label: '名前' },
  { value: 'items', label: '項目が多い順' },
];

function sortSamples(
  list: SampleEntry[],
  key: SampleSort,
  /** 0: 未追加、1: 更新あり、2: 追加済み */
  rank: (s: SampleEntry) => number,
): SampleEntry[] {
  const out = [...list];
  switch (key) {
    case 'name':
      return out.sort((a, b) => a.title.localeCompare(b.title, 'ja'));
    case 'items':
      return out.sort((a, b) => b.itemCount - a.itemCount);
    case 'new':
      // sort は安定なので、同じグループの中ではおすすめ順のまま
      return out.sort((a, b) => rank(a) - rank(b));
    default:
      return out;
  }
}

/** リポジトリに同梱しているサンプル教材の一覧（追加・更新。検索・分野での絞り込み・並べ替え） */
export function SampleList({ compact }: { compact?: boolean }) {
  const [samples, setSamples] = useState<SampleEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const packs = useLibrary((s) => s.packs);
  const loaded = useLibrary((s) => s.loaded);
  const [query, setQuery] = useState('');
  const [subject, setSubject] = useState<string | null>(null);
  const [sort, setSort] = useState<SampleSort>('default');
  const [expanded, setExpanded] = useState(false);

  // 分野が多いので、ボタンは大きなまとまり（英語・数学と理科など）で出す
  const subjects = useMemo(() => countSubjectGroups(samples ?? [], (s) => s.subject), [samples]);
  const visible = useMemo(() => {
    const revisions = new Map(packs.map((p) => [p.id, p.revision ?? 1]));
    const filtered = (samples ?? []).filter(
      (s) =>
        (!subject || subjectGroupKey(s.subject) === subject) &&
        matchesQuery(query, [
          s.title,
          s.description,
          s.level,
          s.tags,
          subjectLabel(subjectKey(s.subject)),
          subjectGroupLabel(subjectGroupKey(s.subject)),
        ]),
    );
    return sortSamples(filtered, sort, (s) => {
      const rev = revisions.get(s.id);
      return rev === undefined ? 0 : rev < s.revision ? 1 : 2;
    });
  }, [samples, packs, query, subject, sort]);

  useEffect(() => {
    fetchSampleIndex().then(setSamples, (e: unknown) => setError(errorMessage(e)));
    if (!useLibrary.getState().loaded) void useLibrary.getState().refresh();
  }, []);

  if (error)
    return (
      <p className="px-1 text-sm text-rose-600">サンプル教材を読み込めませんでした: {error}</p>
    );
  if (!samples || !loaded) {
    return (
      <div className="flex justify-center py-6 text-slate-400">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  // 検索と並べ替えは教材の画面だけ。はじめての案内など狭い場所では分野の絞り込みだけ出す
  const showTools = !compact && samples.length >= 4;
  const showChips = samples.length >= 4 && subjects.length >= 2;
  const shown = compact && !expanded ? visible.slice(0, COMPACT_LIMIT) : visible;
  const chips = (
    <SubjectChips
      subjects={subjects}
      value={subject}
      onChange={setSubject}
      labelOf={subjectGroupLabel}
    />
  );
  return (
    <div className="space-y-3">
      {compact && showChips && (
        <div className="flex flex-wrap gap-1.5">
          {chips}
        </div>
      )}
      {showTools && (
        <>
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="サンプル教材を検索（例: 英語、歴史、敬語）"
            label="サンプル教材を検索"
          />
          <div className="flex flex-wrap items-center gap-2">
            {showChips && chips}
            <Select
              value={sort}
              onChange={setSort}
              options={SORT_OPTIONS}
              aria-label="並べ替え"
              className="ml-auto w-40"
            />
          </div>
        </>
      )}
      <ul className="space-y-2">
        {shown.map((s) => {
          const installed = packs.find((p) => p.id === s.id);
          const updatable = installed && (installed.revision ?? 1) < s.revision;
          return (
            <li
              key={s.id}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{s.title}</div>
                {!compact && s.description && (
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                    {s.description}
                  </p>
                )}
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
                  <span>{subjectLabel(subjectKey(s.subject))}</span>
                  <span>{s.itemCount} 項目</span>
                  <span>{s.itemTypes.map((t) => ITEM_TYPE_LABELS[t]).join('・')}</span>
                  {s.level && <span>{s.level}</span>}
                </div>
              </div>
              <Button
                size="sm"
                variant={installed && !updatable ? 'ghost' : 'primary'}
                disabled={busy !== null || (!!installed && !updatable)}
                onClick={async () => {
                  setBusy(s.id);
                  await installSample(s);
                  setBusy(null);
                }}
              >
                {busy === s.id ? (
                  <Loader2 className="animate-spin" />
                ) : updatable ? (
                  <RefreshCw />
                ) : installed ? (
                  <Check />
                ) : (
                  <Download />
                )}
                {updatable ? '更新' : installed ? '追加済み' : '追加'}
              </Button>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="py-4 text-center text-sm text-slate-500">
            条件に合うサンプル教材がありません
          </li>
        )}
      </ul>
      {shown.length < visible.length && (
        <Button variant="ghost" size="sm" className="w-full" onClick={() => setExpanded(true)}>
          <ChevronDown />
          もっと見る（あと {visible.length - shown.length} 件）
        </Button>
      )}
    </div>
  );
}
