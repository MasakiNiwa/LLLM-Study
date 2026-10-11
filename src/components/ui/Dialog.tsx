import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}

/** フォームなどを載せるモーダル（ネイティブ <dialog>。スマホでは画面いっぱい近くまで広がる） */
export function Dialog({ open, title, onClose, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="m-auto max-h-[92dvh] w-[min(96vw,34rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 text-left text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 px-4 dark:border-slate-800">
            <h2 className="flex-1 truncate font-semibold">{title}</h2>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="閉じる">
              <X />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">{children}</div>
          {footer && (
            <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
