import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from './Button';
import { useSheetSwipe } from './useSheetSwipe';
import { SheetCloseContext } from './sheetContext';

interface BottomSheetProps {
  open: boolean;
  /** 閉じたとき（払う・背景を押す・Esc・閉じるボタン）に呼ばれる */
  onClose: () => void;
  title: string;
  description?: ReactNode;
  /** 中身。項目を選んだら閉じる、などは useSheetClose() で閉じる */
  children: ReactNode;
  /** 下に固定するボタンなど */
  footer?: ReactNode;
  /** 上へ払うと画面の高さいっぱいまで広げられる（中身が長いシート向け） */
  expandable?: boolean;
  className?: string;
}

/** 閉じるアニメーションの長さ（ms）。CSS の duration と合わせる */
const CLOSE_MS = 200;

/**
 * 画面の下から出るシート（PC では画面中央のダイアログ）。
 *
 * - スマホ: 下へ払う（またはつまみを押す）と閉じる。expandable なら上へ払うと広がる
 * - 背景を押す・Esc でも閉じる（閉じるときは下へ滑らせるアニメーション）
 * - ネイティブの <dialog>（showModal）なので、フォーカスはシートの中に閉じ込められる
 *
 * 画面に収まりきらない情報（詳細・選択肢・補足）を、ページを溢れさせずに見せるのに使う。
 */
export function BottomSheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  expandable = false,
  className,
}: BottomSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const closing = useRef(false);

  /** 下へ滑らせて（PC は薄くして）から閉じる */
  const close = useCallback(() => {
    const el = ref.current;
    if (!el || closing.current) return;
    closing.current = true;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      const mobile = window.matchMedia('(max-width: 767px)').matches;
      el.style.transition = mobile ? 'transform 0.2s ease-out' : 'opacity 0.15s ease-out';
      if (mobile) el.style.transform = 'translateY(100%)';
      else el.style.opacity = '0';
      el.style.setProperty('--sheet-backdrop', '0');
    }
    // 見た目を元に戻すのは、実際に閉じたあと（下の effect）。先に戻すと一瞬元の位置に見える
    setTimeout(
      () => {
        closing.current = false;
        setExpanded(false);
        onClose();
      },
      reduce ? 0 : CLOSE_MS,
    );
  }, [onClose]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const clearStyles = () => {
      el.style.transition = '';
      el.style.transform = '';
      el.style.opacity = '';
      el.style.removeProperty('--sheet-backdrop');
    };
    if (open && !el.open) {
      clearStyles();
      el.showModal();
      // showModal は最初のボタン（つまみ）にフォーカスするので、入力欄があればそちらへ移す
      el.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && el.open) {
      el.close();
      clearStyles();
    }
  }, [open]);

  useSheetSwipe({
    enabled: open,
    sheetRef: ref,
    bodyRef,
    onClose: close,
    // 中身が収まりきっていないときだけ広げる（短い中身を広げても空白が増えるだけなので）
    onExpand:
      expandable && !expanded
        ? () => {
            const body = bodyRef.current;
            if (body && body.scrollHeight > body.clientHeight + 4) setExpanded(true);
          }
        : undefined,
    onCollapse: expandable && expanded ? () => setExpanded(false) : undefined,
  });

  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        // Esc: すぐに消さず、アニメーションしてから閉じる
        e.preventDefault();
        close();
      }}
      onClose={() => {
        // ブラウザが直接閉じたとき（フォームの method="dialog" など）
        if (open && !closing.current) onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      className={cn(
        'group/sheet m-0 flex-col overflow-hidden border-slate-200 bg-white p-0 text-slate-900 shadow-2xl open:flex dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100',
        // 背景の暗さ（払っている間は薄くする）
        'backdrop:bg-slate-950/40 backdrop:opacity-[var(--sheet-backdrop,1)] backdrop:transition-opacity',
        // スマホ: 画面の下から出るシート
        'pb-safe fixed inset-x-0 top-auto bottom-0 w-full max-w-none rounded-t-3xl border-t transition-[height,max-height] duration-200 ease-out',
        'open:animate-[sheet-up_0.22s_ease-out]',
        expanded ? 'h-[94dvh] max-h-[94dvh] md:h-auto' : 'max-h-[80dvh]',
        // PC: 画面中央のダイアログ
        'md:inset-0 md:m-auto md:max-h-[85dvh] md:w-[min(92vw,32rem)] md:rounded-2xl md:border md:pb-0 md:open:animate-[sheet-pop_0.18s_ease-out]',
        'motion-reduce:animate-none! motion-reduce:transition-none',
        className,
      )}
    >
      <style>{`@keyframes sheet-up{from{transform:translateY(100%)}to{transform:none}}@keyframes sheet-pop{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:none}}`}</style>
      {/* つまみ: 下へ払えば閉じる印。押しても閉じる */}
      <button
        type="button"
        onClick={close}
        aria-label="閉じる（下へ払っても閉じます）"
        data-sheet-handle=""
        className="mx-auto block h-6 w-16 shrink-0 cursor-grab touch-none md:hidden"
      >
        <span className="mx-auto block h-1 w-10 rounded-full bg-slate-300 dark:bg-slate-700" />
      </button>
      <div className="flex shrink-0 items-start gap-2 px-4 pb-2 md:pt-4" data-sheet-header="">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          {description && (
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={close} aria-label="閉じる">
          <X />
        </Button>
      </div>
      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
        <SheetCloseContext.Provider value={close}>{open && children}</SheetCloseContext.Provider>
      </div>
      {footer && open && (
        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          {footer}
        </div>
      )}
    </dialog>
  );
}
