import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** ネイティブ <dialog> を使った確認ダイアログ（フォーカス管理・Esc はブラウザ任せ） */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'OK',
  danger,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
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
        // 背景クリックで閉じる
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto w-[min(92vw,26rem)] rounded-2xl text-left border border-slate-200 bg-white p-0 text-slate-900 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
    >
      <div className="p-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">{description}</div>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            キャンセル
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={() => {
              onConfirm();
              onClose();
            }}
            autoFocus
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
