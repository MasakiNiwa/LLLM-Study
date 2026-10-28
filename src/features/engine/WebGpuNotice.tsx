import { useEffect } from 'react';
import { Cpu, TriangleAlert } from 'lucide-react';
import { Link } from 'wouter';
import { cn } from '@/lib/utils/cn';
import { useSettings } from '@/features/settings/settingsStore';
import { useEngine } from './engineStore';

function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

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
          {gpuForced ? 'この端末では WebGPU が使えません' : 'この端末では WebGPU が使えません'}
        </p>
        <p className="opacity-90">
          {gpuForced
            ? '設定のバックエンドが GPU になっているため読み込みに失敗します。「自動」か「CPU」に変更してください。'
            : 'AI モデル（Gemma 4 の Web 版）は WebGPU 専用のため、この端末では端末内の AI を使えません。クラウド AI（Gemini・OpenAI・Claude・OpenRouter）なら使えます。学習はそのまま使えます。'}{' '}
          <Link href="/help" className="underline underline-offset-2">
            WebGPU を有効にする方法
          </Link>
        </p>
        {isAndroid() && (
          <p className="text-xs opacity-80">
            Android では、OS の「高度な保護」がオンだと WebGPU
            が止められていることがあります（オフにすると端末の保護が弱まるため、詳しくはヘルプを読んでから判断してください）。
          </p>
        )}
      </div>
    </div>
  );
}
