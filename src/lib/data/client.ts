import * as Comlink from 'comlink';
import type { DataWorkerApi } from './data.worker';

let remote: Comlink.Remote<DataWorkerApi> | null = null;

/** Data Worker（必要になったときに起動する） */
export function dataWorker(): Comlink.Remote<DataWorkerApi> {
  if (!remote) {
    const worker = new Worker(new URL('./data.worker.ts', import.meta.url), { name: 'data' });
    remote = Comlink.wrap<DataWorkerApi>(worker);
  }
  return remote;
}
