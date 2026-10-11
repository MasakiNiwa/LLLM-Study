import { useMemo, useState } from 'react';
import { Download, ExternalLink, Link2, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, Section } from '@/components/ui/Card';
import { Progress } from '@/components/ui/Progress';
import { fileNameFromUrl } from '@/lib/llm/download';
import { isOpfsSupported } from '@/lib/llm/modelStorage';
import { cn } from '@/lib/utils/cn';
import { formatBytes, formatPercent } from '@/lib/utils/format';
import { useEngine } from '@/features/engine/engineStore';
import {
  downloadUrl,
  huggingFacePageUrl,
  MODEL_CATALOG,
  type CatalogModel,
} from '@/lib/llm/modelCatalog';

function Badge({ children, tone }: { children: string; tone: 'ok' | 'warn' | 'muted' }) {
  return (
    <span
      className={cn(
        'rounded-md px-1.5 py-0.5 text-[0.7rem] font-medium',
        tone === 'ok' &&
          'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
        tone === 'warn' && 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
        tone === 'muted' && 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
      )}
    >
      {children}
    </span>
  );
}

function CatalogRow({
  model,
  stored,
  disabled,
  webgpu,
  onDownload,
}: {
  model: CatalogModel;
  stored: boolean;
  disabled: boolean;
  webgpu: boolean | null;
  onDownload: () => void;
}) {
  const unusable = model.gpuOnly && webgpu === false;
  return (
    <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-semibold">{model.title}</span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{model.sizeLabel}</span>
        </div>
        <div
          className="truncate font-mono text-xs text-slate-500 dark:text-slate-400"
          title={model.file}
        >
          {model.file}
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-400">{model.note}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone={model.gpuOnly ? (unusable ? 'warn' : 'muted') : 'ok'}>
            {model.gpuOnly ? 'WebGPU 専用' : 'GPU / CPU 両対応'}
          </Badge>
          <Badge tone="muted">
            {model.official ? '公式サポート' : '公式サポート外・動作報告あり'}
          </Badge>
          <Badge tone="muted">{model.license}</Badge>
          <a
            href={huggingFacePageUrl(model)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-xs text-accent-700 hover:underline dark:text-accent-300"
          >
            Hugging Face
            <ExternalLink className="size-3" />
          </a>
        </div>
        {unusable && (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            この端末では WebGPU が使えないため動きません
          </p>
        )}
      </div>
      <Button
        size="sm"
        variant={stored || unusable ? 'secondary' : 'primary'}
        disabled={disabled || stored}
        onClick={onDownload}
      >
        <Download />
        {stored ? '保存済み' : 'ダウンロード'}
      </Button>
    </div>
  );
}

function DownloadProgressCard() {
  const download = useEngine((s) => s.download);
  const cancel = useEngine((s) => s.cancelDownload);
  if (!download) return null;
  const { name, loadedBytes, totalBytes, bytesPerSec } = download;
  const ratio = totalBytes ? loadedBytes / totalBytes : undefined;
  const remainSec = totalBytes && bytesPerSec ? (totalBytes - loadedBytes) / bytesPerSec : 0;
  return (
    <Card className="animate-fade-in space-y-2 p-4">
      <div className="flex items-center gap-2">
        <Download className="size-4 animate-pulse text-accent-600" />
        <span className="min-w-0 flex-1 truncate font-medium">{name || '接続中…'}</span>
        <Button size="sm" variant="ghost" onClick={cancel}>
          <X />
          中止
        </Button>
      </div>
      <Progress value={ratio} />
      <div className="flex flex-wrap justify-between gap-x-3 font-mono text-xs text-slate-500 tabular-nums dark:text-slate-400">
        <span>
          {formatBytes(loadedBytes)}
          {totalBytes ? ` / ${formatBytes(totalBytes)} (${formatPercent(ratio ?? 0)})` : ''}
        </span>
        <span>
          {formatBytes(bytesPerSec)}/s
          {remainSec > 0 && ` · 残り約 ${Math.ceil(remainSec / 60)} 分`}
        </span>
      </div>
    </Card>
  );
}

/** Hugging Face などの URL からモデルを直接ダウンロードして OPFS に保存する */
export function ModelDownload() {
  const downloading = useEngine((s) => s.download !== null);
  const downloadModel = useEngine((s) => s.downloadModel);
  const webgpu = useEngine((s) => s.webgpu);
  const storedModels = useEngine((s) => s.storedModels);
  const storedNames = useMemo(() => new Set(storedModels.map((m) => m.name)), [storedModels]);
  const [url, setUrl] = useState('');
  const urlValid = fileNameFromUrl(url) !== null;
  const opfs = isOpfsSupported();

  return (
    <Section
      title="モデルを入手"
      icon={<Download />}
      description={
        opfs
          ? 'Hugging Face から直接ダウンロードしてブラウザ内に保存します（サイズが大きいので Wi-Fi 推奨）'
          : 'このブラウザは OPFS に対応していないため、直接ダウンロードは使えません。ファイルを取り込んでください。'
      }
    >
      <DownloadProgressCard />
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {MODEL_CATALOG.filter((m) => m.kind === 'chat' && m.recommended).map((m) => (
          <CatalogRow
            key={m.file}
            model={m}
            stored={storedNames.has(m.file)}
            disabled={!opfs || downloading}
            webgpu={webgpu}
            onDownload={() => void downloadModel(downloadUrl(m))}
          />
        ))}
      </div>
      <form
        className="space-y-2 px-4 py-3.5 sm:px-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!urlValid) return;
          void downloadModel(url);
          setUrl('');
        }}
      >
        <label htmlFor="model-url" className="block text-sm font-medium">
          URL を指定してダウンロード
        </label>
        <div className="flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" />
            <input
              id="model-url"
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://huggingface.co/…/model.litertlm"
              className="h-10 w-full rounded-xl border border-slate-300 bg-white pr-3 pl-9 text-sm dark:border-slate-700 dark:bg-slate-950"
            />
          </div>
          <Button type="submit" variant="primary" disabled={!opfs || downloading || !urlValid}>
            取得
          </Button>
        </div>
        {url && !urlValid && (
          <p className="text-xs text-rose-600">
            末尾が .litertlm のファイル URL を入力してください
          </p>
        )}
      </form>
    </Section>
  );
}
