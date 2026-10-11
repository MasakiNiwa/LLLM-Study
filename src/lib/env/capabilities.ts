/**
 * ブラウザの実行環境を調べる（LiteRT-LM の動作可否の目安）。
 */
export interface CapabilityReport {
  webgpu: boolean;
  adapter?: {
    vendor: string;
    architecture: string;
    description: string;
  };
  shaderF16: boolean;
  subgroups: boolean;
  maxBufferSize?: number;
  maxStorageBufferBindingSize?: number;
  wasm: boolean;
  jspi: boolean;
  opfs: boolean;
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
  storage?: { usage: number; quota: number };
  persisted?: boolean;
  userAgent: string;
}

let cached: Promise<CapabilityReport> | null = null;

export function detectCapabilities(force = false): Promise<CapabilityReport> {
  if (!cached || force) cached = detect();
  return cached;
}

async function detect(): Promise<CapabilityReport> {
  const report: CapabilityReport = {
    webgpu: false,
    shaderF16: false,
    subgroups: false,
    wasm: typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function',
    jspi: typeof WebAssembly !== 'undefined' && 'Suspending' in WebAssembly,
    opfs: !!navigator.storage?.getDirectory,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemoryGb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
    userAgent: navigator.userAgent,
  };

  if (navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (adapter) {
        report.webgpu = true;
        report.shaderF16 = adapter.features.has('shader-f16');
        report.subgroups = adapter.features.has('subgroups');
        report.maxBufferSize = adapter.limits.maxBufferSize;
        report.maxStorageBufferBindingSize = adapter.limits.maxStorageBufferBindingSize;
        const info = adapter.info;
        if (info) {
          report.adapter = {
            vendor: info.vendor,
            architecture: info.architecture,
            description: info.description,
          };
        }
      }
    } catch {
      // WebGPU 無効
    }
  }

  try {
    const est = await navigator.storage?.estimate?.();
    if (est) report.storage = { usage: est.usage ?? 0, quota: est.quota ?? 0 };
    report.persisted = await navigator.storage?.persisted?.();
  } catch {
    // ignore
  }
  return report;
}
