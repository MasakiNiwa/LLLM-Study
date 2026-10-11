import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveModelStream } from './modelStorage';

/** OPFS の最小限の代わり（createWritable は close するまで元のファイルを置き換えない） */
class FakeDir {
  files = new Map<string, Uint8Array>();
  dirs = new Map<string, FakeDir>();
  async getDirectoryHandle(name: string) {
    if (!this.dirs.has(name)) this.dirs.set(name, new FakeDir());
    return this.dirs.get(name)!;
  }
  async getFileHandle(name: string, opts: { create?: boolean } = {}) {
    if (!this.files.has(name)) {
      if (!opts.create) throw new DOMException('not found', 'NotFoundError');
      this.files.set(name, new Uint8Array());
    }
    const files = this.files;
    return {
      async createWritable() {
        const chunks: Uint8Array[] = [];
        const push = (c: Uint8Array | string): void => {
          chunks.push(typeof c === 'string' ? new TextEncoder().encode(c) : c);
        };
        const ws = new WritableStream<Uint8Array | string>({
          write: push,
          close() {
            files.set(name, new Uint8Array(chunks.flatMap((c) => [...c])));
          },
        });
        // FileSystemWritableFileStream の write()（メタデータの書き込みで使う）
        return Object.assign(ws, { write: async (c: Uint8Array | string) => void push(c) });
      },
    };
  }
  async removeEntry(name: string) {
    this.files.delete(name);
  }
}

let root: FakeDir;

beforeEach(() => {
  root = new FakeDir();
  vi.stubGlobal('navigator', { storage: { getDirectory: async () => root } });
});
afterEach(() => vi.unstubAllGlobals());

function failingStream(): ReadableStream<Uint8Array> {
  let sent = false;
  return new ReadableStream({
    pull(c) {
      if (!sent) {
        sent = true;
        c.enqueue(new Uint8Array([9, 9]));
      } else c.error(new Error('network'));
    },
  });
}

describe('saveModelStream', () => {
  it('上書きのダウンロードに失敗しても、保存済みのモデルは残す', async () => {
    const dir = await root.getDirectoryHandle('shared-models');
    dir.files.set('m.litertlm', new Uint8Array([1, 2, 3]));
    await expect(saveModelStream('m.litertlm', failingStream())).rejects.toThrow('network');
    expect([...dir.files.get('m.litertlm')!]).toEqual([1, 2, 3]);
  });

  it('新しく保存するときに失敗したら、書きかけのファイルを残さない', async () => {
    await expect(saveModelStream('new.litertlm', failingStream())).rejects.toThrow('network');
    const dir = await root.getDirectoryHandle('shared-models');
    expect(dir.files.has('new.litertlm')).toBe(false);
  });

  it('成功したら本体とメタデータを保存する', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array([4, 5]));
        c.close();
      },
    });
    await saveModelStream('ok.litertlm', stream);
    const dir = await root.getDirectoryHandle('shared-models');
    expect([...dir.files.get('ok.litertlm')!]).toEqual([4, 5]);
    expect(dir.files.has('ok.litertlm.meta.json')).toBe(true);
  });
});
