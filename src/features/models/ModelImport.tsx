import { useRef, useState, type DragEvent } from 'react';
import { FileUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { isOpfsSupported } from '@/lib/llm/modelStorage';
import { cn } from '@/lib/utils/cn';
import { useEngine } from '@/features/engine/engineStore';
import { isBrowserCompatibleName } from '@/lib/llm/modelCatalog';
import { useSettings } from '@/features/settings/settingsStore';

const ACCEPT = '.litertlm';

/** .litertlm ファイルの取り込み（ファイル選択 + ドラッグ＆ドロップ） */
interface ModelImportProps {
  compact?: boolean;
}

export function ModelImport({ compact }: ModelImportProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  /** Web 版でないファイルを選んだときの確認待ち */
  const [nonWebFile, setNonWebFile] = useState<File | null>(null);
  const load = useEngine((s) => s.load);
  const loading = useEngine((s) => s.status === 'loading');
  const save = useSettings((s) => s.saveImportedModels) && isOpfsSupported();

  const handleFile = (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.litertlm')) {
      toast.error('.litertlm ファイルを選んでください', { description: file.name });
      return;
    }
    if (!isBrowserCompatibleName(file.name)) {
      setNonWebFile(file);
      return;
    }
    void load({ kind: 'file', file, save });
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center transition-colors',
        compact ? 'gap-3 px-4 py-6' : 'gap-4 px-6 py-10',
        dragging
          ? 'border-accent-500 bg-accent-50 dark:bg-accent-900/20'
          : 'border-slate-300 bg-white/60 dark:border-slate-700 dark:bg-slate-900/40',
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-2xl bg-accent-100 text-accent-700 dark:bg-accent-900/40 dark:text-accent-300">
        <FileUp className="size-6" />
      </div>
      <div>
        <p className="font-medium">.litertlm ファイルを取り込む</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Hugging Face からダウンロードしたファイルを選択
          <span className="hidden md:inline">、またはここにドロップ</span>
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          公式の Web 版（ファイル名が <code className="font-mono">-web.litertlm</code>{' '}
          のもの）がおすすめです
        </p>
      </div>
      <Button variant="primary" onClick={() => inputRef.current?.click()} disabled={loading}>
        ファイルを選択
      </Button>
      {save && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          取り込んだモデルはブラウザ内（OPFS）に保存され、次回から即座に読み込めます
        </p>
      )}
      <ConfirmDialog
        open={nonWebFile !== null}
        title="ブラウザでの動作が未確認のモデルです"
        description={
          <div className="space-y-2">
            <p>
              「{nonWebFile?.name}」はファイル名が <code className="font-mono">-web.litertlm</code>{' '}
              で終わっていません。スマホ・PC
              アプリ向けのモデルは、ブラウザではモデル全体を一度にメモリへ読み込む必要があり、
              特にスマホではメモリ不足で失敗する可能性が高いです。
            </p>
            <p>
              「モデルを入手」にある公式の Web 版（Gemma
              4）の利用をおすすめします。続行する場合、動作を確認できるまでブラウザには保存しません。
            </p>
          </div>
        }
        confirmLabel="それでも読み込む"
        onConfirm={() => nonWebFile && void load({ kind: 'file', file: nonWebFile, save: false })}
        onClose={() => setNonWebFile(null)}
      />
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
