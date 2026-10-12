import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

/** since からの経過時間を 0.1 秒刻みで数える（AI の応答を待つあいだの表示） */
export function ElapsedCounter({
  since,
  label,
  className,
}: {
  since: number;
  label?: string;
  className?: string;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, []);
  const sec = Math.max(0, now - since) / 1000;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[0.7rem] text-slate-400 tabular-nums',
        className,
      )}
      aria-live="off"
    >
      <Timer className="size-3" />
      {label && <span>{label}</span>}
      {sec.toFixed(1)} 秒
    </span>
  );
}
