import { Cpu, Power, Share2 } from 'lucide-react';
import { PageBody, PageHeader } from '@/app/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { TRY_LOCAL_URL } from '@/lib/constants';
import { formatBytes, formatDuration } from '@/lib/utils/format';
import { resolveBackend, useEngine } from '@/features/engine/engineStore';
import { WebGpuNotice } from '@/features/engine/WebGpuNotice';
import { LoadProgressCard } from '@/features/models/LoadProgressCard';
import { ModelDownload } from '@/features/models/ModelDownload';
import { ModelImport } from '@/features/models/ModelImport';
import { StoredModelList } from '@/features/models/StoredModelList';
import { BACKEND_LABELS } from '@/features/settings/labels';
import { useSettings } from '@/features/settings/settingsStore';

function CurrentModel() {
  const status = useEngine((s) => s.status);
  const model = useEngine((s) => s.model);
  const error = useEngine((s) => s.error);
  const fallbackLog = useEngine((s) => s.fallbackLog);
  const load = useEngine((s) => s.load);
  const backendHints = useSettings((s) => s.backendHints);
  const updateSettings = useSettings((s) => s.update);
  const storedModels = useEngine((s) => s.storedModels);
  const unload = useEngine((s) => s.unload);
  const backendSetting = useSettings((s) => s.backend);
  const webgpu = useEngine((s) => s.webgpu);
  const backend = resolveBackend(backendSetting, webgpu);
  const maxNumTokens = useSettings((s) => s.maxNumTokens);

  if (status === 'error') {
    return (
      <Card className="border-rose-200 p-4 text-sm text-rose-700 dark:border-rose-900 dark:text-rose-300">
        <p className="font-medium">読み込みに失敗しました</p>
        <p className="mt-1 break-all whitespace-pre-line">{error}</p>
      </Card>
    );
  }
  if (status !== 'ready' || !model) return null;

  const isStored = storedModels.some((m) => m.name === model.name);
  // 自動フォールバックで別のバックエンドになった場合は「設定変更」とはみなさない
  const needsReload =
    (fallbackLog.length === 0 && model.backend !== backend) || model.maxNumTokens !== maxNumTokens;
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          <Cpu className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">使用中のモデル</div>
          <div className="truncate font-semibold" title={model.name}>
            {model.name}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
            <span>{formatBytes(model.sizeBytes)}</span>
            <span>{BACKEND_LABELS[model.backend]}</span>
            <span>文脈長 {model.maxNumTokens}</span>
            <span>読み込み {formatDuration(model.loadTimeMs)}</span>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void unload()} title="モデルを解放">
          <Power />
          解放
        </Button>
      </div>
      {fallbackLog.length > 0 && (
        <details className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <summary className="cursor-pointer font-medium">
            {BACKEND_LABELS[model.backend]} で実行中（ほかの方法では読み込めませんでした）
          </summary>
          <ul className="mt-2 space-y-1.5">
            {fallbackLog.map((f, i) => (
              <li key={i} className="break-all">
                <span className="font-medium">{BACKEND_LABELS[f.backend]}:</span> {f.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {model.backend === 'cpu' && webgpu && backendHints[model.name] && isStored && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <span>前回 GPU で読み込めなかったため、このモデルは CPU で読み込んでいます</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const rest = { ...backendHints };
              delete rest[model.name];
              updateSettings({ backendHints: rest });
              void load({ kind: 'stored', name: model.name }, 'gpu-artisan');
            }}
          >
            GPU で再試行
          </Button>
        </div>
      )}
      {needsReload && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          エンジン設定が変更されています。反映するにはモデルを読み込み直してください。
        </p>
      )}
    </Card>
  );
}

export default function ModelsPage() {
  const loading = useEngine((s) => s.status === 'loading');
  return (
    <>
      <PageHeader title="AI モデル" />
      <PageBody>
        <p className="px-1 text-sm text-slate-600 dark:text-slate-400">
          AI パートナーは、この端末のブラウザの中で動くローカル
          LLM（LiteRT-LM）です。学習カードだけならモデルは不要です。
        </p>
        <WebGpuNotice />
        <CurrentModel />
        <LoadProgressCard />
        <StoredModelList />
        {!loading && <ModelImport />}
        <ModelDownload />
        <Card className="flex gap-3 p-4 text-sm text-slate-600 dark:text-slate-400">
          <Share2 className="mt-0.5 size-5 shrink-0 text-accent-600" />
          <div className="space-y-1">
            <p className="font-medium text-slate-800 dark:text-slate-200">
              モデルは他のサイトと共有されます
            </p>
            <p>
              保存したモデルは、同じ github.io（masakiniwa.github.io）の他のサイト（
              <a
                href={TRY_LOCAL_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent-700 underline dark:text-accent-300"
              >
                Try Local
              </a>{' '}
              など）と共通の保存領域に置かれ、どのサイトからでも使えます。他のサイトで保存済みのモデルも上の一覧に表示されます。
              ⤓
              ボタンで端末のファイルとして書き出す（バックアップ）こともでき、書き出したファイルは「ファイルを選択」で戻せます。
            </p>
          </div>
        </Card>
      </PageBody>
    </>
  );
}
