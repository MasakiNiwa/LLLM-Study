import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import type { ItemRecord } from '@/lib/db/types';
import { updatePackItem } from '@/lib/packs/install';
import { ItemSchema, type StudyItem } from '@/lib/packs/schema';
import { ITEM_TYPE_LABELS } from '@/lib/packs/templates';
import { errorMessage } from '@/lib/utils/format';
import { CardFace } from '@/features/items/ItemCard';
import { ImagePicker } from '@/features/items/ImagePicker';
import { useLibrary } from './libraryStore';

type Checked = { ok: true; item: StudyItem } | { ok: false; errors: string[] };

/** 入力された JSON を項目として検証する（種類と ID は元のまま） */
function check(text: string, original: StudyItem, image: string): Checked {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`JSON として読み取れません（${errorMessage(e)}）`] };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, errors: ['{ } で囲んだ 1 つの項目にしてください'] };
  }
  const r = ItemSchema.safeParse({
    ...data,
    id: original.id,
    type: original.type,
    ...(image ? { image } : {}),
  });
  if (!r.success) {
    return {
      ok: false,
      errors: r.error.issues
        .slice(0, 10)
        .map((i) => `${i.path.join('.') || '(全体)'}: ${i.message}`),
    };
  }
  return { ok: true, item: r.data };
}

/** 画像は data URL が長いので JSON からは外して、別に扱う */
function toText(item: StudyItem): string {
  const { id: _id, type: _type, image: _image, ...rest } = item;
  return JSON.stringify(rest, null, 2);
}

/**
 * 取り込んだ教材の項目を直す（誤字や答えの間違いの修正）。
 * どの種類の項目でも直せるよう、項目の中身を JSON で編集する。プレビューで仕上がりを確かめられる。
 */
export function ItemJsonEditor({
  record,
  onClose,
  onSaved,
}: {
  record: ItemRecord | null;
  onClose: () => void;
  onSaved?: () => void;
}) {
  return (
    <Dialog open={record !== null} title="項目を直す" onClose={onClose}>
      {record && (
        <EditorBody key={record.key} record={record} onClose={onClose} onSaved={onSaved} />
      )}
    </Dialog>
  );
}

function EditorBody({
  record,
  onClose,
  onSaved,
}: {
  record: ItemRecord;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [text, setText] = useState(() => toText(record.item));
  const [image, setImage] = useState(record.item.image ?? '');
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [saving, setSaving] = useState(false);
  const checked = useMemo(() => check(text, record.item, image), [text, record.item, image]);

  const save = async () => {
    if (!checked.ok) return;
    setSaving(true);
    try {
      await updatePackItem(record.key, checked.item);
      toast.success('項目を直しました');
      void useLibrary.getState().refresh();
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error('保存できませんでした', { description: errorMessage(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        {ITEM_TYPE_LABELS[record.item.type]}・id:{' '}
        <span className="font-mono">{record.item.id}</span>
        。学習記録はそのまま残ります。教材を取り込み直すと（サンプルの更新を含む）、この修正は上書きされます。
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={10}
        spellCheck={false}
        aria-label="項目の内容（JSON）"
        className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs leading-relaxed dark:border-slate-700 dark:bg-slate-950"
      />
      <div className="space-y-1">
        <span className="text-sm font-medium">画像（任意）</span>
        <ImagePicker value={image} onChange={setImage} />
      </div>
      {!checked.ok ? (
        <div className="space-y-1 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
          <p className="flex items-center gap-1.5 font-medium">
            <AlertTriangle className="size-4" />
            直すところがあります
          </p>
          <ul className="list-inside list-disc">
            {checked.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-medium">プレビュー</span>
            <Button
              size="sm"
              variant={side === 'front' ? 'secondary' : 'ghost'}
              onClick={() => setSide('front')}
            >
              表
            </Button>
            <Button
              size="sm"
              variant={side === 'back' ? 'secondary' : 'ghost'}
              onClick={() => setSide('back')}
            >
              裏
            </Button>
          </div>
          <div className="pointer-events-none rounded-xl border border-slate-200 px-4 py-5 dark:border-slate-700">
            <CardFace
              record={{ ...record, item: checked.item }}
              template={
                record.item.type === 'vocab' || record.item.type === 'phrase'
                  ? 'recognize'
                  : 'basic'
              }
              side={side}
              seed="preview"
            />
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" onClick={onClose}>
          キャンセル
        </Button>
        <Button variant="primary" disabled={!checked.ok || saving} onClick={() => void save()}>
          {saving && <Loader2 className="animate-spin" />}
          保存
        </Button>
      </div>
    </div>
  );
}
