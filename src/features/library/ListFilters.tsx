import { Search } from 'lucide-react';
import { subjectLabel } from '@/lib/packs/subjects';
import { cn } from '@/lib/utils/cn';

/** 教材の一覧の検索欄 */
export function SearchBox({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        className="h-10 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-9 text-sm dark:border-slate-700 dark:bg-slate-950"
      />
    </div>
  );
}

/** 分野で絞り込むボタンの列（null は「すべて」） */
export function SubjectChips({
  subjects,
  value,
  onChange,
  labelOf = subjectLabel,
}: {
  /** [分野のキー, 件数] */
  subjects: [string, number][];
  value: string | null;
  onChange: (v: string | null) => void;
  /** キーの表示名（既定は分野の表示名） */
  labelOf?: (key: string) => string;
}) {
  const total = subjects.reduce((n, [, c]) => n + c, 0);
  return (
    <>
      {([[null, total], ...subjects] as [string | null, number][]).map(([k, count]) => (
        <button
          key={k ?? 'all'}
          type="button"
          aria-pressed={value === k}
          onClick={() => onChange(k)}
          className={cn(
            'rounded-full border px-3 py-1 text-xs transition-colors',
            value === k
              ? 'border-accent-500 bg-accent-50 text-accent-800 dark:bg-accent-900/30 dark:text-accent-200'
              : 'border-slate-300 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800',
          )}
        >
          {k === null ? 'すべて' : labelOf(k)}
          <span className="ml-1 opacity-60">{count}</span>
        </button>
      ))}
    </>
  );
}
