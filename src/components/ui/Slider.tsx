interface SliderProps {
  id?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}

/** 現在値表示付きのレンジスライダー */
export function Slider({ id, value, min, max, step, onChange, format }: SliderProps) {
  return (
    <div className="flex w-44 shrink-0 items-center gap-3 sm:w-56">
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 min-w-0 flex-1 cursor-pointer accent-accent-600"
      />
      <output htmlFor={id} className="w-12 text-right font-mono text-sm tabular-nums">
        {format ? format(value) : value}
      </output>
    </div>
  );
}
