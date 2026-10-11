import { cn } from '@/lib/utils/cn';
import { CUSTOM_PERSONA_ID, PERSONAS } from './personas';

const CUSTOM = {
  id: CUSTOM_PERSONA_ID,
  name: 'カスタム',
  emoji: '✨',
  tagline: '性格を自分で書く',
};

/** AI の性格を選ぶボタンの一覧（設定画面・はじめての案内で使う） */
export function PersonaPicker({
  value,
  onChange,
  includeCustom = true,
}: {
  value: string;
  onChange: (id: string) => void;
  includeCustom?: boolean;
}) {
  const options = includeCustom ? [...PERSONAS, CUSTOM] : PERSONAS;
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((p) => (
        <button
          key={p.id}
          type="button"
          aria-pressed={value === p.id}
          onClick={() => onChange(p.id)}
          className={cn(
            'flex items-start gap-3 rounded-xl border p-3 text-left transition-colors',
            value === p.id
              ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
              : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50',
          )}
        >
          <span className="text-2xl" aria-hidden>
            {p.emoji}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{p.name}</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">{p.tagline}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
