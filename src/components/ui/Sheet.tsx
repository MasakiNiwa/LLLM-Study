import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** タイトル右側のアクション */
  actions?: ReactNode;
}

/** 画面左からスライドインするパネル（ネイティブ <dialog> ベース） */
export function Sheet({ open, title, onClose, children, actions }: SheetProps) {
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
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="pt-safe pb-safe m-0 h-dvh max-h-dvh w-[min(88vw,22rem)] max-w-none border-r border-slate-200 bg-white p-0 text-slate-900 shadow-2xl open:animate-[sheet-in_0.2s_ease-out] dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
    >
      <style>{`@keyframes sheet-in{from{transform:translateX(-100%)}to{transform:none}}`}</style>
      <div className="flex h-full flex-col">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 px-3 dark:border-slate-800">
          <h2 className="flex-1 truncate font-semibold">{title}</h2>
          {actions}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="閉じる">
            <X />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </dialog>
  );
}
