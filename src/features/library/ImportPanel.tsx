import { useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardPaste, Eraser, FileUp, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import type { ParseResult } from '@/lib/packs/parse';
import { ITEM_TYPE_LABELS } from '@/lib/packs/templates';
import { errorMessage } from '@/lib/utils/format';
import { installParsedPack, parsePackInWorker } from './packActions';
import { useLibrary } from './libraryStore';

/** 外部 AI が作った教材（JSON）を貼り付け・ファイルで取り込む */
export function ImportPanel({ onInstalled }: { onInstalled?: () => void }) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<ParseResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const packs = useLibrary((s) => s.packs);

  const check = async (value: string) => {
    if (!value.trim()) {
      setResult(null);
      return;
    }
    setChecking(true);
    try {
      setResult(await parsePackInWorker(value));
    } catch (e) {
      setResult({ ok: false, error: errorMessage(e), issues: [] });
    } finally {
      setChecking(false);
    }
  };

  const clear = () => {
    setText('');
    setResult(null);
  };

  const paste = async () => {
    try {
      const value = await navigator.clipboard.readText();
      setText(value);
      void check(value);
    } catch {
      toast.error('クリップボードを読み取れませんでした', {
        description: '入力欄に直接貼り付けてください',
      });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast.error('ファイルが大きすぎます（20MB まで）');
      return;
    }
    const value = await file.text();
    setText(value);
    void check(value);
  };

  const existing = result?.ok ? packs.find((p) => p.id === result.pack.id) : undefined;

  return (
    <div className="space-y-3">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void paste()}>
            <ClipboardPaste />
            貼り付け
          </Button>
          <Button size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            <FileUp />
            ファイルを選ぶ
          </Button>
          <Button size="sm" variant="ghost" onClick={clear} disabled={!text} className="ml-auto">
            <Eraser />
            クリア
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.txt,.md,application/json,text/plain"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        <textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setResult(null);
          }}
          onBlur={() => void check(text)}
          rows={8}
          spellCheck={false}
          placeholder={
            '外部の AI が作った教材の JSON をここに貼り付けてください\n（```json のコードブロックや前後の文章が付いていても大丈夫です）'
          }
          className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs leading-relaxed dark:border-slate-700 dark:bg-slate-950"
        />
        <div className="flex justify-end">
          <Button
            variant="secondary"
            onClick={() => void check(text)}
            disabled={!text.trim() || checking}
          >
            {checking && <Loader2 className="animate-spin" />}
            確認する
          </Button>
        </div>
      </Card>

      {result && !result.ok && (
        <Card className="space-y-2 border-rose-200 p-4 text-sm dark:border-rose-900">
          <p className="flex items-center gap-2 font-medium text-rose-700 dark:text-rose-300">
            <AlertTriangle className="size-4" />
            {result.error}
          </p>
          {result.issues.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto font-mono text-xs text-slate-600 dark:text-slate-400">
              {result.issues.map((i, n) => (
                <li key={n}>
                  <span className="text-rose-600">{i.path || '(全体)'}</span>: {i.message}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-slate-500">
            AI に「次のエラーを直して、JSON
            全体をもう一度出力してください」とエラー内容を伝えると直してもらえます。
          </p>
        </Card>
      )}

      {result?.ok && (
        <Card className="space-y-3 p-4">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{result.pack.title}</div>
              {result.pack.description && (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {result.pack.description}
                </p>
              )}
              <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-500">
                <span>{result.pack.items.length} 項目</span>
                <span>
                  {[...new Set(result.pack.items.map((i) => ITEM_TYPE_LABELS[i.type]))].join('・')}
                </span>
                <span className="font-mono">id: {result.pack.id}</span>
              </div>
            </div>
          </div>
          {result.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-700 dark:text-amber-400">
              {w}
            </p>
          ))}
          {existing && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              同じ ID の教材「{existing.title}」があります。取り込むと更新されます（同じ項目 ID
              の学習記録は引き継ぎ、無くなった項目は削除されます）。
            </p>
          )}
          <Button
            variant="primary"
            className="w-full"
            disabled={installing}
            onClick={async () => {
              if (!result.ok) return;
              setInstalling(true);
              const s = await installParsedPack(result.pack, 'import');
              setInstalling(false);
              if (s) {
                clear();
                onInstalled?.();
              }
            }}
          >
            {installing && <Loader2 className="animate-spin" />}
            {existing ? '更新する' : '取り込む'}
          </Button>
        </Card>
      )}
    </div>
  );
}
