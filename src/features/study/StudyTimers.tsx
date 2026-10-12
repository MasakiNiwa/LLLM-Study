import { useEffect, useRef, useState } from 'react';
import { Hourglass, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';
import { formatClock } from '@/lib/utils/format';
import { useSettings } from '@/features/settings/settingsStore';
import { useStudy } from './studyStore';

/** 1 秒ごとに今の時刻を返す（このコンポーネントだけを描き直す） */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

/**
 * 学習中の時間の表示（設定でオンにしたものだけ）。
 * - 問題ごと: 経過時間（答えを見たら止める）、テストモードでは残り時間
 * - 学習全体: 経過時間、制限時間があれば残り時間
 * 1 問の制限時間になったら onCardTimeUp を 1 回だけ呼ぶ。
 */
export function StudyTimers({ onCardTimeUp }: { onCardTimeUp: () => void }) {
  const now = useNow();
  const shownAt = useStudy((s) => s.shownAt);
  const revealedAt = useStudy((s) => s.revealedAt);
  const startedAt = useStudy((s) => s.stats.startedAt);
  const showCard = useSettings((s) => s.showCardTimer);
  const showSession = useSettings((s) => s.showSessionTimer);
  const cardLimit = useSettings((s) => s.cardTimeLimit);
  const sessionLimit = useSettings((s) => s.sessionTimeLimit);

  // 表示を更新した時刻より、答えを見た時刻やカードを出した時刻のほうが新しいことがある
  const cardElapsed = Math.max(0, (revealedAt ?? Math.max(now, shownAt)) - shownAt);
  const cardLeft = cardLimit * 1000 - cardElapsed;
  const sessionElapsed = Math.max(0, now - startedAt);
  const sessionLeft = sessionLimit * 60_000 - sessionElapsed;
  const counting = revealedAt === null;

  // 1 問の制限時間（カードごとに 1 回だけ）
  const firedFor = useRef(0);
  useEffect(() => {
    if (cardLimit > 0 && counting && cardLeft <= 0 && firedFor.current !== shownAt) {
      firedFor.current = shownAt;
      onCardTimeUp();
    }
  }, [cardLimit, counting, cardLeft, shownAt, onCardTimeUp]);

  // 学習全体の制限時間（学習ごとに 1 回だけ知らせる）
  const warnedFor = useRef(0);
  useEffect(() => {
    if (sessionLimit > 0 && sessionLeft <= 0 && warnedFor.current !== startedAt) {
      warnedFor.current = startedAt;
      toast.info('時間になりました', { description: 'このカードを評価したら終わります' });
    }
  }, [sessionLimit, sessionLeft, startedAt]);

  const card =
    cardLimit > 0 ? (
      <span
        className={cn(
          'inline-flex items-center gap-0.5',
          counting && cardLeft <= 5000 && 'font-semibold text-rose-600 dark:text-rose-400',
        )}
        title="この問題の残り時間（テストモード）"
      >
        <Hourglass className="size-3.5" aria-label="この問題の残り時間" />
        {formatClock(Math.max(0, cardLeft) + (counting && cardLeft > 0 ? 999 : 0))}
      </span>
    ) : showCard ? (
      <span className="inline-flex items-center gap-0.5" title="この問題にかけている時間">
        <Timer className="size-3.5" aria-label="この問題の経過時間" />
        {formatClock(cardElapsed)}
      </span>
    ) : null;

  const session =
    sessionLimit > 0 ? (
      <span
        className={cn(
          'inline-flex items-center gap-0.5',
          sessionLeft <= 60_000 && 'font-semibold text-rose-600 dark:text-rose-400',
        )}
        title="学習の残り時間"
      >
        <span className="font-sans text-xs">あと</span>
        {formatClock(Math.max(0, sessionLeft) + (sessionLeft > 0 ? 999 : 0))}
      </span>
    ) : showSession ? (
      <span className="inline-flex items-center gap-0.5" title="学習を始めてからの時間">
        <span className="font-sans text-xs">計</span>
        {formatClock(sessionElapsed)}
      </span>
    ) : null;

  if (!card && !session) return null;
  return (
    <span className="inline-flex items-center gap-2 font-mono text-sm whitespace-nowrap text-slate-500 tabular-nums">
      {card}
      {session}
    </span>
  );
}
