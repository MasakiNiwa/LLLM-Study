# ドキュメント

LLLM Study は、**ローカル LLM を使うアプリと、github.io のサイト間で共通にする仕様の参考リポジトリ**です。
新しいリポジトリを作るときは、ここの文書とコードを参照してください。

## 文書の一覧

| 文書                                               | 内容                                                                                                                                        | 新しいリポジトリで           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| [SHARED_MODEL_STORAGE.md](SHARED_MODEL_STORAGE.md) | 同じ github.io のサイト間で AI モデルを共有する保存領域の仕様（OPFS・ロック・通知・バックアップ）                                           | **モデルを扱うなら必ず従う** |
| [LOCAL_LLM_GUIDE.md](LOCAL_LLM_GUIDE.md)           | ブラウザ内で LLM（LiteRT-LM）を動かす組み込み方。コピーして使うファイル・読み込みとフォールバック・生成・AI に任せすぎない設計・PWA・テスト | 参考にする                   |
| [UI_GUIDE.md](UI_GUIDE.md)                         | スマホ / PC の画面の作り方と部品（ボトムシートの払う操作・折りたたみ見出しなど）                                                            | 参考にする                   |
| [SPEC.md](SPEC.md)                                 | LLLM Study の仕様とロードマップ                                                                                                             | このアプリ固有               |
| [STUDY_PACK_FORMAT.md](STUDY_PACK_FORMAT.md)       | 教材パックの形式（自動生成）                                                                                                                | このアプリ固有               |

## 新しいリポジトリを始めるときのチェックリスト

- [ ] GitHub Pages で公開し、`vite.config.ts` の `base` は `'./'`（サブパスでもフォークでも動く）
- [ ] ライセンスは MIT。依存パッケージのライセンス一覧を自動生成し（`scripts/generate-licenses.mjs`）、CI で確かめる
- [ ] ヘルプにリポジトリへのリンク・クレジット・ライセンスを置く（アプリのヘッダーには GitHub のアイコンを置かない。リリース履歴へのリンクは置かない）
- [ ] CI: `licenses:check` → `format:check` → `lint` → `typecheck` → `test` → `build`
- [ ] スマホは下部ナビ、PC はサイドバー（[UI_GUIDE.md](UI_GUIDE.md)）
- [ ] 重い処理は Web Worker へ。GPU（WebGPU）が使えるなら使い、使えない端末でも動く部分は動くようにする
- [ ] ローカル LLM を使うなら:
  - [ ] [共通モデル保存領域](SHARED_MODEL_STORAGE.md) に従う（`shared-models/`・Web Locks・BroadcastChannel・アプリ名）
  - [ ] localStorage のキーや IndexedDB の名前にはアプリ固有の接頭辞を付ける（同じオリジンのほかのサイトとぶつけない）
  - [ ] [LOCAL_LLM_GUIDE.md](LOCAL_LLM_GUIDE.md) のファイルをコピーし、`APP_NAME` などを差し替える
- [ ] PWA にするなら manifest の `id` を決めて変えない
- [ ] 作業は「PR を作る → CI が通ったら main へマージ」を 1 セットで進める
