import { useId } from 'react';
import { cn } from '@/lib/utils/cn';

interface DurationFieldProps {
  /** 0 は「なし」 */
  value: number;
  onChange: (value: number) => void;
  /** 単位（例: 秒、分） */
  unit: string;
  /** スライダーの上限（数字の欄では inputMax まで入れられる） */
  sliderMax: number;
  step: number;
  inputMax: number;
  label: string;
  className?: string;
}

/**
 * 時間の長さを決める欄。スライダーでおおまかに、数字の欄で細かく（スライダーより長くも）決められる。
 * 0（空欄）は「なし」。
 */
export function DurationField({
  value,
  onChange,
  unit,
  sliderMax,
  step,
  inputMax,
  label,
  className,
}: DurationFieldProps) {
  const id = useId();
  const clamp = (n: number) => Math.min(inputMax, Math.max(0, Math.round(n)));
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <input
        type="range"
        min={0}
        max={sliderMax}
        step={step}
        value={Math.min(value, sliderMax)}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        aria-label={`${label}（スライダー）`}
        className="h-2 min-w-0 flex-1 cursor-pointer accent-accent-600"
      />
      <div className="flex shrink-0 items-center gap-1.5">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={inputMax}
          value={value === 0 ? '' : value}
          placeholder="なし"
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange(e.target.value === '' || !Number.isFinite(n) ? 0 : clamp(n));
          }}
          aria-label={`${label}（${unit}）`}
          className="h-9 w-20 rounded-lg border border-slate-300 bg-white px-2 text-right font-mono text-sm tabular-nums dark:border-slate-700 dark:bg-slate-950"
        />
        <label htmlFor={id} className="w-5 text-sm text-slate-500 dark:text-slate-400">
          {unit}
        </label>
      </div>
    </div>
  );
}
