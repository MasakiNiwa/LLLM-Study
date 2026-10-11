import { useRef, useState } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { imageToDataUrl } from '@/lib/utils/image';
import { errorMessage } from '@/lib/utils/format';

/** カードに付ける画像を選ぶ（縮小して埋め込む）。value は data URL か空文字 */
export function ImagePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (dataUrl: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await imageToDataUrl(file));
    } catch (e) {
      toast.error('画像を読み込めませんでした', { description: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {value ? (
        <div className="relative">
          <img
            src={value}
            alt="カードの画像"
            className="h-20 max-w-40 rounded-lg border border-slate-200 object-contain dark:border-slate-700"
          />
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="画像を外す"
            title="画像を外す"
            className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-slate-700 text-white shadow"
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}
      <Button
        size="sm"
        variant="secondary"
        onClick={() => fileRef.current?.click()}
        disabled={busy}
      >
        {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
        {value ? '画像を変える' : '画像を追加'}
      </Button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
