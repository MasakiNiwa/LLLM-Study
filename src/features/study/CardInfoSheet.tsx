import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { Info } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { db } from '@/lib/db/db';
import type { CardRecord, ItemRecord, ReviewRecord } from '@/lib/db/types';
import { itemAnswer, itemTitle } from '@/lib/packs/itemText';
import { ITEM_TYPE_LABELS, templateLabel } from '@/lib/packs/templates';
import { retrievability } from '@/lib/srs/scheduler';
import { cn } from '@/lib/utils/cn';

const STATE_LABELS = ['未学習', '学習中', '復習', '再学習'] as const;
const GRADE_VIEW: Record<number, { label: string; className: string }> = {
  1: {
    label: 'もう一度',
    className: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
  },
  2: {
    label: '難しい',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  },
  3: {
    label: '正解',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  },
  4: { label: '簡単', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' },
};

/** 表示する評価の履歴の数 */
const HISTORY = 12;

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </>
  );
}

/** 学習中のカードの詳細（学習状況・記憶の推定・評価の履歴）。カードの上には収まらない情報をシートで見せる */
function CardInfo({
  card,
  item,
  revealed,
}: {
  card: CardRecord;
  item: ItemRecord;
  revealed: boolean;
}) {
  const [state, setState] = useState<{
    id: string;
    reviews: ReviewRecord[];
    pack?: string;
    now: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      db.reviews.where('cardId').equals(card.id).reverse().sortBy('review'),
      db.packs.get(card.packId),
    ]).then(([reviews, pack]) => {
      if (!cancelled)
        setState({
          id: card.id,
          reviews: reviews.slice(0, HISTORY),
          pack: pack?.title,
          now: Date.now(),
        });
    });
    return () => {
      cancelled = true;
    };
  }, [card.id, card.packId]);

  const loaded = state?.id === card.id ? state : null;
  const recall = loaded ? retrievability(card, loaded.now) : undefined;
  return (
    <div className="space-y-4 text-sm">
      <div>
        {/* 答えを見る前は、項目の中身（答えが分かるもの）を出さない */}
        <div className="font-semibold">
          {revealed ? itemTitle(item.item) : '（答えを見ると表示します）'}
        </div>
        <div className="text-slate-500 dark:text-slate-400">
          {loaded?.pack ?? '…'}・{ITEM_TYPE_LABELS[item.item.type]}（
          {templateLabel(item.item.type, card.template)}）
        </div>
      </div>
      <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
        <Row label="状態" value={STATE_LABELS[card.state]} />
        <Row label="復習した回数" value={`${card.reps} 回`} />
        <Row label="忘れた回数" value={`${card.lapses} 回`} />
        {card.state !== 0 && (
          <>
            <Row
              label="いま思い出せる確率（推定）"
              value={recall === undefined ? '-' : `${Math.round(recall * 100)}%`}
            />
            <Row label="記憶の安定度" value={`${card.stability.toFixed(1)} 日`} />
            <Row label="難しさ（1〜10）" value={card.difficulty.toFixed(1)} />
            <Row label="次の予定" value={format(card.due, 'yyyy/M/d HH:mm')} />
          </>
        )}
        {card.introducedDay && <Row label="初めて学習した日" value={card.introducedDay} />}
      </dl>
      <div>
        <div className="mb-1.5 font-medium">評価の履歴（新しい順）</div>
        {!loaded ? (
          <p className="text-slate-400">読み込み中…</p>
        ) : loaded.reviews.length === 0 ? (
          <p className="text-slate-500 dark:text-slate-400">まだ評価していません</p>
        ) : (
          <ul className="space-y-1">
            {loaded.reviews.map((r) => (
              <li key={r.id} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-xs text-slate-500 tabular-nums">
                  {format(r.review, 'yyyy/M/d HH:mm')}
                </span>
                <span
                  className={cn(
                    'rounded px-1.5 py-px text-xs font-medium',
                    GRADE_VIEW[r.rating]?.className,
                  )}
                >
                  {GRADE_VIEW[r.rating]?.label ?? r.rating}
                </span>
                <span className="text-xs text-slate-500">
                  次は {Math.max(0, Math.round(r.scheduled_days))} 日後
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {revealed && (
        <p className="text-xs text-slate-500 dark:text-slate-400">答え: {itemAnswer(item.item)}</p>
      )}
    </div>
  );
}

/** カードの上部に置く「i」ボタンと、このカードについてのシート */
export function CardInfoButton({
  card,
  item,
  revealed,
}: {
  card: CardRecord;
  item: ItemRecord;
  revealed: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="このカードについて"
        title="このカードについて（学習状況・評価の履歴）"
        className="inline-flex items-center rounded-md px-1 py-0.5 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
      >
        <Info className="size-4" />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="このカードについて" expandable>
        <CardInfo card={card} item={item} revealed={revealed} />
      </BottomSheet>
    </>
  );
}
