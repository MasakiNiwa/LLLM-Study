import { useEffect, useState } from 'react';
import { CheckCircle2, MinusCircle, XCircle } from 'lucide-react';
import { detectCapabilities, type CapabilityReport } from '@/lib/env/capabilities';
import { formatBytes } from '@/lib/utils/format';

type Level = 'ok' | 'warn' | 'ng';

function Row({ label, level, value }: { label: string; level?: Level; value: string }) {
  const Icon = level === 'ok' ? CheckCircle2 : level === 'ng' ? XCircle : MinusCircle;
  const color =
    level === 'ok' ? 'text-emerald-500' : level === 'ng' ? 'text-rose-500' : 'text-slate-400';
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
      {level ? (
        <Icon className={`size-4 shrink-0 ${color}`} />
      ) : (
        <span className="size-4 shrink-0" />
      )}
      <span className="flex-1">{label}</span>
      <span
        className="max-w-[55%] truncate text-right font-mono text-xs text-slate-600 dark:text-slate-400"
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/** WebGPU などの対応状況を表示する */
export function CapabilityCheck() {
  const [r, setR] = useState<CapabilityReport | null>(null);
  useEffect(() => {
    void detectCapabilities().then(setR);
  }, []);
  if (!r) return <p className="px-4 py-3 text-sm text-slate-500 sm:px-5">確認中…</p>;

  const gpuName = r.adapter
    ? [r.adapter.vendor, r.adapter.architecture, r.adapter.description].filter(Boolean).join(' ')
    : '';
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      <Row
        label="WebGPU"
        level={r.webgpu ? 'ok' : 'ng'}
        value={r.webgpu ? gpuName || '利用可能' : '利用不可（CPU で実行）'}
      />
      <Row
        label="shader-f16"
        level={r.shaderF16 ? 'ok' : 'warn'}
        value={r.shaderF16 ? '対応' : '非対応'}
      />
      <Row
        label="subgroups"
        level={r.subgroups ? 'ok' : 'warn'}
        value={r.subgroups ? '対応' : '非対応'}
      />
      {r.maxBufferSize !== undefined && (
        <Row label="GPU 最大バッファ" value={formatBytes(r.maxBufferSize)} />
      )}
      <Row
        label="WebAssembly"
        level={r.wasm ? 'ok' : 'ng'}
        value={r.wasm ? '対応（CPU 実行に必要）' : '利用不可'}
      />
      <Row
        label="WebAssembly JSPI"
        level={r.jspi ? 'ok' : 'warn'}
        value={r.jspi ? '対応（高速版）' : '非対応（互換版）'}
      />
      <Row
        label="OPFS（モデル保存）"
        level={r.opfs ? 'ok' : 'ng'}
        value={r.opfs ? '対応' : '非対応'}
      />
      {r.storage && (
        <Row
          label="ストレージ"
          value={`${formatBytes(r.storage.usage)} / ${formatBytes(r.storage.quota)}${r.persisted ? '（永続化済み）' : ''}`}
        />
      )}
      {r.hardwareConcurrency && (
        <Row label="CPU スレッド数" value={String(r.hardwareConcurrency)} />
      )}
      {r.deviceMemoryGb && <Row label="メモリ（目安）" value={`${r.deviceMemoryGb} GB 以上`} />}
    </div>
  );
}
