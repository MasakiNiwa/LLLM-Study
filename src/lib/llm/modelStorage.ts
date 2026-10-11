/**
 * 共通モデル保存領域（Shared Model Storage）。
 *
 * 同じ GitHub ユーザーの github.io サイト（例: masakiniwa.github.io/LLLM-Study と
 * masakiniwa.github.io/Try-Local）は同じオリジンなので、OPFS を共有している。
 * その OPFS の決まった場所・決まった形式でモデルを保存し、どのサイトからも使えるようにする。
 * 仕様は docs/SHARED_MODEL_STORAGE.md を参照（他のサイトでも同じ仕様で実装する）。
 *
 * - 保存場所: OPFS の `shared-models/` 直下
 * - メタデータ: モデルと同じ場所の `<ファイル名>.meta.json`
 * - 排他制御: Web Locks（`shared-models:<ファイル名>`）
 * - 変更通知: BroadcastChannel（`shared-models`）
 *
 * メインスレッドと Worker の両方から使える API だけを使う。
 */
import { APP_NAME } from '@/lib/constants';
import type { StoredModel } from './types';

export const SHARED_DIR = 'shared-models';
export const META_SUFFIX = '.meta.json';
export const CHANNEL_NAME = 'shared-models';

/** `<ファイル名>.meta.json` の中身（仕様 version 1） */
export interface SharedModelMeta {
  version: 1;
  name: string;
  sizeBytes: number;
  savedBy: string;
  savedAt: string;
  source?: string;
}

export function isOpfsSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.storage?.getDirectory;
}

/** 書き込み途中のファイルやメタデータを除いた、モデル本体のファイルか */
export function isModelFileName(name: string): boolean {
  return (
    !name.startsWith('.') &&
    !name.endsWith(META_SUFFIX) &&
    !name.endsWith('.crswap') &&
    !name.endsWith('.tmp')
  );
}

function withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined;
  return locks ? locks.request(`shared-models:${name}`, fn) : fn();
}

/** 同じオリジンのほかのタブ・サイトに変更を知らせる */
function notifyChanged(): void {
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage({ type: 'changed', by: APP_NAME });
    ch.close();
  } catch {
    // BroadcastChannel 非対応でも保存自体は成功している
  }
}

/** 他のタブ・サイトでモデルが追加・削除されたら呼ばれる。戻り値で購読解除 */
export function subscribeSharedModels(onChange: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => undefined;
  const ch = new BroadcastChannel(CHANNEL_NAME);
  ch.onmessage = () => onChange();
  return () => ch.close();
}

async function sharedDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(SHARED_DIR, { create: true });
}

function entries(dir: FileSystemDirectoryHandle) {
  return dir as unknown as AsyncIterable<[string, FileSystemHandle]>;
}

async function readMeta(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<SharedModelMeta | undefined> {
  try {
    const file = await (await dir.getFileHandle(name + META_SUFFIX)).getFile();
    return JSON.parse(await file.text()) as SharedModelMeta;
  } catch {
    return undefined;
  }
}

async function writeMeta(dir: FileSystemDirectoryHandle, meta: SharedModelMeta): Promise<void> {
  const writable = await (
    await dir.getFileHandle(meta.name + META_SUFFIX, { create: true })
  ).createWritable();
  await writable.write(JSON.stringify(meta, null, 2));
  await writable.close();
}

/** 共通保存領域のモデル一覧（extension を指定するとその拡張子だけ） */
export async function listStoredModels(extension = '.litertlm'): Promise<StoredModel[]> {
  if (!isOpfsSupported()) return [];
  const dir = await sharedDir();
  const result: StoredModel[] = [];
  for await (const [name, handle] of entries(dir)) {
    if (handle.kind !== 'file' || !isModelFileName(name)) continue;
    if (extension && !name.toLowerCase().endsWith(extension)) continue;
    const file = await (handle as FileSystemFileHandle).getFile();
    const meta = await readMeta(dir, name);
    result.push({
      name,
      sizeBytes: file.size,
      lastModified: file.lastModified,
      savedBy: meta?.savedBy,
      source: meta?.source,
    });
  }
  return result.sort((a, b) => b.lastModified - a.lastModified);
}

export async function getStoredModelFile(name: string): Promise<File> {
  const dir = await sharedDir();
  return (await dir.getFileHandle(name)).getFile();
}

export async function deleteStoredModel(name: string): Promise<void> {
  const dir = await sharedDir();
  await withLock(name, async () => {
    await dir.removeEntry(name);
    await dir.removeEntry(name + META_SUFFIX).catch(() => undefined);
  });
  notifyChanged();
}

/** 共通保存領域のモデルをすべて削除する（同じオリジンの他のサイトのモデルも消える） */
export async function deleteAllStoredModels(): Promise<void> {
  const root = await navigator.storage.getDirectory();
  await withLock('*', () => root.removeEntry(SHARED_DIR, { recursive: true }));
  notifyChanged();
}

/**
 * ストリームを共通保存領域に書き込む。失敗・中断時は書きかけのファイルを残さず、
 * 同名のモデルがすでにあった場合はそれを残す（上書きのダウンロードに失敗しても消えない）。
 * （createWritable は一時ファイルに書き、close 時に置き換えるので、他のサイトから途中の状態は見えない）
 */
export async function saveModelStream(
  name: string,
  stream: ReadableStream<Uint8Array>,
  options: {
    onProgress?: (writtenBytes: number) => void;
    signal?: AbortSignal;
    source?: string;
  } = {},
): Promise<void> {
  const dir = await sharedDir();
  // 退避されにくくする（ユーザー許可が要る場合もあるので結果は問わない）
  void navigator.storage.persist?.().catch(() => false);

  await withLock(name, async () => {
    // 同名のモデルがすでにあるか（上書きに失敗しても、元のモデルは消さない）
    const existed = await dir.getFileHandle(name).then(
      () => true,
      () => false,
    );
    const handle = await dir.getFileHandle(name, { create: true });
    const writable = await handle.createWritable();
    let written = 0;
    try {
      await stream
        .pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            transform(chunk, controller) {
              written += chunk.byteLength;
              options.onProgress?.(written);
              controller.enqueue(chunk);
            },
          }),
        )
        .pipeTo(writable, { signal: options.signal });
    } catch (e) {
      // 書きかけの内容は捨てる（close する前なら元のファイルは置き換わらない）
      await writable.abort().catch(() => undefined);
      // 今回新しく作ったファイルだけを消す。既存のモデル（他のサイトが保存したものを含む）は残す
      if (!existed) await dir.removeEntry(name).catch(() => undefined);
      throw e;
    }
    await writeMeta(dir, {
      version: 1,
      name,
      sizeBytes: written,
      savedBy: APP_NAME,
      savedAt: new Date().toISOString(),
      source: options.source,
    });
  });
  notifyChanged();
}

/**
 * File を共通保存領域にコピーする。同名でサイズも同じファイルが既にあればスキップする
 * （他のサイトが保存済みのモデルもそのまま使う）。
 */
export async function saveModelFile(
  file: File,
  onProgress?: (writtenBytes: number) => void,
): Promise<void> {
  const dir = await sharedDir();
  try {
    const existing = await (await dir.getFileHandle(file.name)).getFile();
    if (existing.size === file.size) {
      onProgress?.(file.size);
      return;
    }
  } catch {
    // 未保存
  }
  await saveModelStream(file.name, file.stream(), { onProgress });
}

// ---- ブラウザの外へのバックアップ ----

type SaveFilePicker = (options: {
  suggestedName?: string;
  types?: { description: string; accept: Record<string, string[]> }[];
}) => Promise<FileSystemFileHandle>;

/** 保存先を選べる（File System Access API が使える）か */
export function canPickSaveLocation(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
}

/**
 * 共通保存領域のモデルを端末のファイルとして書き出す（バックアップ）。
 * - 保存先を選べるブラウザ（PC の Chrome / Edge など）: 選んだ場所へストリームで書き出す
 * - それ以外（スマホなど）: 通常のダウンロードとして保存する（多くの場合「ダウンロード」フォルダ）
 * どちらもメモリにファイル全体を読み込まない。戻り値: 'saved' | 'downloaded' | 'cancelled'
 */
export async function exportStoredModel(
  name: string,
  onProgress?: (writtenBytes: number, totalBytes: number) => void,
): Promise<'saved' | 'downloaded' | 'cancelled'> {
  const file = await getStoredModelFile(name);
  if (canPickSaveLocation()) {
    let handle: FileSystemFileHandle;
    try {
      handle = await (
        window as unknown as { showSaveFilePicker: SaveFilePicker }
      ).showSaveFilePicker({
        suggestedName: name,
        types: [
          {
            description: 'LiteRT-LM モデル',
            accept: { 'application/octet-stream': ['.litertlm'] },
          },
        ],
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled';
      throw e;
    }
    const writable = await handle.createWritable();
    let written = 0;
    await file
      .stream()
      .pipeThrough(
        new TransformStream<Uint8Array, Uint8Array>({
          transform(chunk, controller) {
            written += chunk.byteLength;
            onProgress?.(written, file.size);
            controller.enqueue(chunk);
          },
        }),
      )
      .pipeTo(writable);
    return 'saved';
  }
  // OPFS の File はディスク上のデータを参照するだけなので、Blob URL にしてもメモリを使わない
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}
