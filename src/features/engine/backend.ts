import type { BackendKind } from '@/lib/llm/types';
import type { BackendSetting } from '@/features/settings/settingsStore';

/** WebGPU が使えないことが原因のエラーか */
export function isWebGpuError(message: string): boolean {
  return /gpu adapter|webgpu|navigator\.gpu|requestAdapter|GPUDevice/i.test(message);
}

/** 設定値（auto を含む）を実際に使うバックエンドに解決する */
export function resolveBackend(setting: BackendSetting, webgpu: boolean | null): BackendKind {
  if (setting !== 'auto') return setting;
  return webgpu === false ? 'cpu' : 'gpu-artisan';
}
