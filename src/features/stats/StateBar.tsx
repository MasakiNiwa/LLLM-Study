import type { CardStateSummary } from '@/lib/data/stats';

const SEGMENTS: { key: keyof CardStateSummary; label: string; color: string }[] = [
  { key: 'newCards', label: '未学習', color: 'var(--viz-neutral)' },
  { key: 'learning', label: '学習中', color: 'var(--viz-orange)' },
  { key: 'young', label: '復習中', color: 'var(--viz-aqua)' },
  { key: 'mature', label: '定着（21日以上）', color: 'var(--viz-blue)' },
];

/** カードの状態の内訳（積み上げ横棒＋凡例に数を併記） */
export function StateBar({ states }: { states: CardStateSummary }) {
  const total = SEGMENTS.reduce((s, x) => s + states[x.key], 0);
  if (total === 0) return <p className="text-sm text-slate-500">まだカードがありません</p>;
  return (
    <div className="space-y-3">
      <div
        className="flex h-4 gap-0.5 overflow-hidden rounded-md"
        role="img"
        aria-label="カードの状態の内訳"
      >
        {SEGMENTS.filter((s) => states[s.key] > 0).map((s) => (
          <div
            key={s.key}
            title={`${s.label}: ${states[s.key]} 枚`}
            style={{ width: `${(states[s.key] / total) * 100}%`, background: s.color }}
            className="min-w-1 first:rounded-l-md last:rounded-r-md"
          />
        ))}
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-4">
        {SEGMENTS.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="size-3 shrink-0 rounded-sm" style={{ background: s.color }} />
            <span className="text-slate-600 dark:text-slate-400">{s.label}</span>
            <span className="ml-auto font-semibold tabular-nums sm:ml-0">{states[s.key]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
