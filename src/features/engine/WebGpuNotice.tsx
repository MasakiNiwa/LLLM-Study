import { useEffect } from 'react';
import { Cpu, TriangleAlert } from 'lucide-react';
import { Link } from 'wouter';
import { cn } from '@/lib/utils/cn';
import { useSettings } from '@/features/settings/settingsStore';
import { useEngine } from './engineStore';

/**
 * WebGPU が使えない端末向けの案内。
 * 自動設定なら CPU で動くこと、GPU 固定ならエラーになることを知らせる。
 */
export function WebGpuNotice({ className }: { className?: string }) {
  const webgpu = useEngine((s) => s.webgpu);
  const detect = useEngine((s) => s.detectWebGpu);
  const backend = useSettings((s) => s.backend);

  useEffect(() => {
    if (webgpu === null) void detect();
  }, [webgpu, detect]);

  if (webgpu !== false || backend === 'cpu') return null;

  const gpuForced = backend !== 'auto';
  return (
    <div
      className={cn(
        'flex gap-3 rounded-2xl border px-4 py-3 text-sm',
        gpuForced
          ? 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
          : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200',
        className,
      )}
    >
      {gpuForced ? (
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      ) : (
        <Cpu className="mt-0.5 size-4 shrink-0" />
      )}
      <div className="space-y-1">
        <p className="font-medium">
          {gpuForced
            ? 'この端末では WebGPU が使えません'
            : 'この端末では WebGPU が使えないため CPU で実行します'}
        </p>
        <p className="opacity-90">
          {gpuForced
            ? '設定のバックエンドが GPU になっているため読み込みに失敗します。「自動」か「CPU」に変更してください。'
            : 'Gemma 4 の Web 版は WebGPU 専用のため使えません。CPU でも動く Qwen3 0.6B（「モデル」画面からダウンロード可）を使ってください。'}{' '}
          <Link href="/help" className="underline underline-offset-2">
            WebGPU を有効にする方法
          </Link>
        </p>
      </div>
    </div>
  );
}
