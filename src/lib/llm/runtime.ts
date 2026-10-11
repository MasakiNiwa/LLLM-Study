/// <reference lib="webworker" />
/**
 * Worker 内の LiteRT-LM ランタイムの読み込みとストリームのユーティリティ。
 * チャット用と埋め込み用は別々の Worker で動かす（client.ts を参照）。
 */
import { loadLiteRtLm } from '@litert-lm/core';

declare const self: DedicatedWorkerGlobalScope & { Module?: unknown };

let runtimePromise: Promise<unknown> | null = null;

export function ensureRuntime(wasmBaseUrl: string): Promise<unknown> {
  if (!runtimePromise) {
    const base = wasmBaseUrl.endsWith('/') ? wasmBaseUrl : `${wasmBaseUrl}/`;
    // Worker 内では Emscripten が自分の URL を基準に .wasm を探してしまうため、明示的に指定する
    self.Module = { locateFile: (file: string) => base + file };
    runtimePromise = loadLiteRtLm(base).catch((e) => {
      runtimePromise = null;
      throw e;
    });
  }
  return runtimePromise;
}

/** バイト数を数えつつ一定間隔で進捗を通知するストリームを作る */
export function countingStream(
  source: ReadableStream<Uint8Array>,
  onBytes: (loaded: number) => void,
): ReadableStream<Uint8Array> {
  let loaded = 0;
  let lastReport = 0;
  return source.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        const now = performance.now();
        if (now - lastReport > 80) {
          lastReport = now;
          onBytes(loaded);
        }
        controller.enqueue(chunk);
      },
      flush() {
        onBytes(loaded);
      },
    }),
  );
}
