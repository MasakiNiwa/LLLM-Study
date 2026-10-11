import { useDeferredValue, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ClipboardPaste, Eraser, FileUp, Loader2, Table2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { parseTable, tableToPack, type TableItemType } from '@/lib/packs/table';
import { installParsedPack } from './packActions';
import { useLibrary } from './libraryStore';

const LANGS = [
  { value: 'en', label: '英語' },
  { value: 'ko', label: '韓国語' },
  { value: 'zh', label: '中国語' },
  { value: 'fr', label: 'フランス語' },
  { value: 'de', label: 'ドイツ語' },
  { value: 'es', label: 'スペイン語' },
  { value: 'ja', label: '日本語' },
  { value: '', label: '指定しない' },
];

/** 1 行目が見出しらしいか（「意味」「answer」などの列名が並んでいる） */
function looksLikeHeader(row: string[] | undefined): boolean {
  if (!row || row.length < 2) return false;
  return row
    .slice(0, 2)
    .every((c) =>
      /^(英語|単語|見出し|問題|質問|表|裏|意味|答え|日本語|訳|front|back|term|word|question|answer|meaning|definition)$/i.test(
        c,
      ),
    );
}

/**
 * 表（CSV・TSV）から教材を取り込む。
 * Excel・スプレッドシートからのコピー（タブ区切り）や、Anki・Quizlet の書き出しをそのまま貼り付けられる。
 */
export function TableImport({ onInstalled }: { onInstalled?: () => void }) {
  const [text, setText] = useState('');
  const [title, setTitle] = useState('');
  const [type, setType] = useState<TableItemType>('vocab');
  const [lang, setLang] = useState('en');
  const [header, setHeader] = useState<boolean | null>(null);
  const [installing, setInstalling] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const packs = useLibrary((s) => s.packs);

  const deferred = useDeferredValue(text);
  const rows = useMemo(() => (deferred.trim() ? parseTable(deferred) : []), [deferred]);
  // 見出し行の有無は、選ばれていなければ中身から推測する
  const hasHeader = header ?? looksLikeHeader(rows[0]);
  const result = useMemo(
    () =>
      rows.length
        ? tableToPack(rows, {
            type,
            title,
            header: hasHeader,
            targetLang: type === 'vocab' ? lang || undefined : undefined,
          })
        : null,
    [rows, type, title, hasHeader, lang],
  );
  const existing = result?.ok ? packs.find((p) => p.id === result.pack.id) : undefined;
  const preview = rows.slice(hasHeader ? 1 : 0, (hasHeader ? 1 : 0) + 5);

  const load = (value: string, name?: string) => {
    setText(value);
    setHeader(null);
    if (name && !title) setTitle(name.replace(/\.(csv|tsv|txt)$/i, ''));
  };

  const paste = async () => {
    try {
      load(await navigator.clipboard.readText());
    } catch {
      toast.error('クリップボードを読み取れませんでした', {
        description: '入力欄に直接貼り付けてください',
      });
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('ファイルが大きすぎます（5MB まで）');
      return;
    }
    load(await file.text(), file.name);
  };

  const clear = () => {
    setText('');
    setTitle('');
    setHeader(null);
  };

  return (
    <div className="space-y-3">
      <Card className="space-y-3 p-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          1 列目に問題（単語）、2 列目に答え（意味）、3 列目に補足（任意）を並べた表を取り込めます。
          Excel やスプレッドシートのセルをコピーして貼り付けるか、CSV・TSV ファイル（Anki・Quizlet
          の書き出しなど）を選んでください。
        </p>
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
            accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain"
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
        <textarea
          value={text}
          onChange={(e) => load(e.target.value)}
          rows={6}
          spellCheck={false}
          aria-label="表（CSV・TSV）"
          placeholder={'apple\tりんご\nbook\t本; 書籍\n（タブ区切り・カンマ区切りのどちらでも）'}
          className="w-full resize-y rounded-xl border border-slate-300 bg-white p-3 font-mono text-xs leading-relaxed dark:border-slate-700 dark:bg-slate-950"
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <div className="text-sm font-medium">種類</div>
            <div className="flex gap-2">
              <Chip active={type === 'vocab'} onClick={() => setType('vocab')}>
                単語（意味は ; で区切る）
              </Chip>
              <Chip active={type === 'qa'} onClick={() => setType('qa')}>
                一問一答
              </Chip>
            </div>
          </div>
          {type === 'vocab' && (
            <div className="space-y-1.5">
              <label htmlFor="table-lang" className="block text-sm font-medium">
                学ぶ言語（読み上げに使います）
              </label>
              <Select id="table-lang" value={lang} onChange={setLang} options={LANGS} />
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="table-title" className="block text-sm font-medium">
              教材の名前
            </label>
            <input
              id="table-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例: 英検準2級の単語"
              className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            />
          </div>
          <div className="flex items-center justify-between gap-3 self-end rounded-xl bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
            <span className="text-sm">1 行目は見出し（列名）</span>
            <Switch checked={hasHeader} onChange={setHeader} label="1 行目は見出し" />
          </div>
        </div>
      </Card>

      {result && !result.ok && (
        <Card className="space-y-2 border-rose-200 p-4 text-sm dark:border-rose-900">
          <p className="flex items-center gap-2 font-medium text-rose-700 dark:text-rose-300">
            <AlertTriangle className="size-4" />
            {result.error}
          </p>
          {result.issues.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto text-xs text-slate-600 dark:text-slate-400">
              {result.issues.map((i, n) => (
                <li key={n}>
                  <span className="text-rose-600">{i.path || '(全体)'}</span>: {i.message}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {result?.ok && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Table2 className="size-5 shrink-0 text-emerald-600" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{result.pack.title}</div>
              <div className="text-xs text-slate-500">
                {result.pack.items.length} 項目（{type === 'vocab' ? '単語' : '一問一答'}）
              </div>
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-800/50">
                <tr>
                  <th className="px-3 py-1.5 font-medium">{type === 'vocab' ? '単語' : '問題'}</th>
                  <th className="px-3 py-1.5 font-medium">{type === 'vocab' ? '意味' : '答え'}</th>
                  <th className="px-3 py-1.5 font-medium">補足</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {preview.map((r, i) => (
                  <tr key={i}>
                    {[0, 1, 2].map((c) => (
                      <td key={c} className="max-w-48 truncate px-3 py-1.5">
                        {r[c] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.warnings.map((w) => (
            <p key={w} className="text-xs text-amber-700 dark:text-amber-400">
              {w}
            </p>
          ))}
          {existing && (
            <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              同じ名前の教材「{existing.title}
              」があります。取り込むと更新されます（同じ問題の学習記録は引き継ぎ、表から消えた行は削除されます）。
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
