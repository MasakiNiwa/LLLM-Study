# 共通モデル保存仕様（Shared Model Storage）v1

同じ GitHub ユーザーの GitHub Pages で公開している複数の Web アプリで、
ダウンロードした AI モデルを**共有**し、**ブラウザの外にバックアップ**できるようにするための取り決めです。
本アプリ（LLLM Study）と [Try Local](https://github.com/MasakiNiwa/Try-Local) はこの仕様で実装しています（`src/lib/llm/modelStorage.ts`）。今後作るサイトも同じ仕様で実装します。

> この文書は Try Local の [docs/SHARED_MODEL_STORAGE.md](https://github.com/MasakiNiwa/Try-Local/blob/main/docs/SHARED_MODEL_STORAGE.md) と同じ内容です。仕様を変えるときは両方を揃えてください。

## なぜ共有できるのか

`https://masakiniwa.github.io/LLLM-Study/` と `https://masakiniwa.github.io/Try-Local/` は、
パスが違っても**オリジン（`https://masakiniwa.github.io`）が同じ**です。
ブラウザの保存領域（OPFS・IndexedDB・localStorage・Cache Storage）はオリジン単位なので、
もともと共有されています。この仕様では「どこに・どの形式で置くか」を統一します。

> ⚠️ 独自ドメインを設定したサイトは別オリジンになるため共有できません。
> また、ブラウザで「masakiniwa.github.io のデータを削除」すると、全サイトのモデルが消えます。

## 保存場所と形式

| 項目       | 内容                                                                                                       |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| 保存先     | OPFS（`navigator.storage.getDirectory()`）直下の `shared-models/` ディレクトリ                             |
| モデル本体 | `shared-models/<ファイル名>`（Hugging Face などの元のファイル名のまま。例: `gemma-4-E2B-it-web.litertlm`） |
| メタデータ | `shared-models/<ファイル名>.meta.json`（任意。無くても読めること）                                         |
| 対象外     | `.meta.json`・`.crswap`・`.tmp` で終わるもの、`.` で始まるもの                                             |
| 種類の判定 | 拡張子で各アプリが判断する（`.litertlm`・`.task`・`.onnx` など、使えるものだけ表示する）                   |

### メタデータ（`.meta.json`）

```json
{
  "version": 1,
  "name": "gemma-4-E2B-it-web.litertlm",
  "sizeBytes": 2010000000,
  "savedBy": "Try Local",
  "savedAt": "2026-10-11T00:00:00.000Z",
  "source": "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm"
}
```

- `savedBy`: 保存したアプリの表示名。一覧で「〇〇で保存」と表示するのに使う
- `source`: URL からダウンロードした場合の入手元（任意）
- 知らないキーは無視すること（将来の拡張のため）

## 読み書きのルール

1. **書き込み**は `FileSystemFileHandle.createWritable()` でストリーム書き込みする。
   一時ファイルに書かれ `close` 時に置き換わるので、他のサイトから書きかけの状態は見えない。
   失敗・中断したら書きかけの内容を捨てる（`writable.abort()`）。
   **新しく作ったファイルだけを削除し、同名のファイルがもともとあった場合は削除しない**
   （上書きのダウンロードに失敗しても、他のサイトが保存したモデルを消さないため）。書き終えたらメタデータを書く
2. **排他制御**: 書き込み・削除は Web Locks で `shared-models:<ファイル名>` をロックして行う
   （全削除は `shared-models:*`）。Web Locks は同じオリジンの全タブ・全サイトで共有される
3. **変更通知**: 保存・削除したら `BroadcastChannel('shared-models')` に `{ type: 'changed', by: <アプリ名> }` を送る。
   各アプリはこれを受けて一覧を読み直す（タブが前面に戻ったときも読み直すとよい）
4. **重複保存しない**: 同名・同サイズのファイルが既にあれば、それをそのまま使う
5. **削除は慎重に**: 他のサイトも使っているので、削除の確認画面でその旨を伝える
6. **永続化の要求**: 保存時に `navigator.storage.persist()` を呼び、ブラウザに退避されにくくする
7. **アプリ固有のデータは分ける**: 設定や履歴などは `shared-models/` に置かず、
   localStorage のキーや IndexedDB の DB 名にアプリ固有の接頭辞を付ける（例: `try-local:`）

## ブラウザの外へのバックアップ

- **書き出し**: `showSaveFilePicker()` が使えるブラウザ（PC の Chrome / Edge など）では保存先を選んでストリームで書き出す。
  使えない場合（スマホなど）は、OPFS の `File` から Blob URL を作って `<a download>` でダウンロードする
  （OPFS の `File` はディスク上のデータを参照するだけなので、数 GB でもメモリに読み込まない）
- **復元**: 書き出したファイルを通常の「ファイルを取り込む」で読み込むと、`shared-models/` に保存される

## 最小限の実装例

```ts
const root = await navigator.storage.getDirectory();
const dir = await root.getDirectoryHandle('shared-models', { create: true });

// 一覧
for await (const [name, handle] of dir) {
  if (handle.kind !== 'file' || name.endsWith('.meta.json') || name.endsWith('.crswap')) continue;
  const file = await handle.getFile(); // Blob としてそのままモデル読み込みに渡せる
}

// 保存
await navigator.locks.request(`shared-models:${name}`, async () => {
  const existed = await dir.getFileHandle(name).then(
    () => true,
    () => false,
  );
  const writable = await (await dir.getFileHandle(name, { create: true })).createWritable();
  try {
    await response.body.pipeTo(writable);
  } catch (e) {
    await writable.abort().catch(() => {});
    if (!existed) await dir.removeEntry(name).catch(() => {}); // 既存のモデルは消さない
    throw e;
  }
  const meta = await (
    await dir.getFileHandle(`${name}.meta.json`, { create: true })
  ).createWritable();
  await meta.write(
    JSON.stringify({
      version: 1,
      name,
      sizeBytes,
      savedBy: 'My App',
      savedAt: new Date().toISOString(),
    }),
  );
  await meta.close();
});
new BroadcastChannel('shared-models').postMessage({ type: 'changed', by: 'My App' });
```

## 履歴

- v1（2026-10）: 初版（Try Local で策定）。LLLM Study も v1 で対応
- v1.1（2026-10）: 上書き保存に失敗したとき、既存のファイルを削除しないことを明記（仕様の変更ではなく、実装の不具合の修正に合わせた明確化）
