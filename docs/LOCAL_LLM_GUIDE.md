# ローカル LLM の組み込みガイド

ブラウザの中で LLM（LiteRT-LM + Gemma 4 など）を動かすアプリを作るときの、**LLLM Study の実装を元にした手引き**です。
新しいリポジトリでは、この文書と [共通モデル保存領域の仕様](SHARED_MODEL_STORAGE.md) を読み、該当するファイルをコピーして使ってください。

> 参考実装: LLLM Study（このリポジトリ）。Try Local（[MasakiNiwa/Try-Local](https://github.com/MasakiNiwa/Try-Local)）も同じ構成です（画像入力・埋め込みモデルは Try Local を参照）。

## 1. 全体の構成

```
UI（React・メインスレッド）
  └ features/engine/engineStore.ts  … モデルの状態（読み込み・フォールバック・エラーの説明）
  └ features/ai/*                    … 用途ごとのプロンプトと、出力の検証（zod）
        │ Comlink（RPC）
        ▼
Engine Worker（lib/llm/engine.worker.ts）… LiteRT-LM を動かす専用 Worker
  ├ Wasm ランタイム（自サイトにセルフホスト）
  ├ モデルの読み込み（ストリーミング）・推論・ツール呼び出しのループ
  └ モデルのダウンロード → OPFS の共通保存領域（lib/llm/modelStorage.ts）
```

- **重い処理はすべて Worker**: モデル読み込み・推論・ダウンロードを Worker で行い、UI を止めない
- **Worker は classic worker**: LiteRT-LM の Wasm ローダーが `importScripts()` を使うため、`vite.config.ts` で `worker.format: 'iife'`
- **Wasm はセルフホスト**: `build/vite-plugin-litertlm-wasm.ts` が `@litert-lm/core/wasm` を `dist/litertlm-wasm/<バージョン>/` にコピーする（パスにバージョンを含めるので、更新時に古いキャッシュと混ざらない）

## 2. コピーして使うファイル

| ファイル                             | 役割                                                                                  | 依存                            |
| ------------------------------------ | ------------------------------------------------------------------------------------- | ------------------------------- |
| `src/lib/llm/types.ts`               | Worker とやり取りする型（読み込み・生成・ツール）                                     | なし                            |
| `src/lib/llm/engine.worker.ts`       | LiteRT-LM の実行（読み込み・生成・KV キャッシュ再利用・ツールのループ・ダウンロード） | `@litert-lm/core`, `comlink`    |
| `src/lib/llm/client.ts`              | メインスレッドからの呼び出し口（`llm.loadModel` / `generate` / `cancel` など）        | `comlink`                       |
| `src/lib/llm/runtime.ts`             | Wasm ランタイムの読み込み（1 回だけ）                                                 | なし                            |
| `src/lib/llm/modelStorage.ts`        | 共通モデル保存領域（OPFS）・端末へのバックアップ                                      | なし（`APP_NAME` だけ差し替え） |
| `src/lib/llm/modelCatalog.ts`        | 動作確認済みモデルの一覧と入手先・GPU 専用かどうか                                    | なし                            |
| `src/lib/llm/modelQuirks.ts`         | モデルごとのくせ（Qwen3 の思考オフなど）                                              | なし                            |
| `src/lib/llm/download.ts`            | Hugging Face の URL の正規化                                                          | なし                            |
| `build/vite-plugin-litertlm-wasm.ts` | Wasm のセルフホスト（dev 配信・build 時コピー）                                       | `vite`                          |
| `src/features/engine/engineStore.ts` | 読み込みとフォールバック・保存済みモデル一覧                                          | `zustand`                       |
| `src/features/engine/loadErrors.ts`  | 読み込みエラーの分類と、ユーザー向けの説明                                            | なし                            |
| `src/features/ai/aiBusy.ts`          | 生成の排他（同時に 1 つだけ）                                                         | `zustand`                       |
| `src/features/ai/oneshot.ts`         | 履歴を持たない単発の生成                                                              | 上記                            |
| `src/features/chat/historyBudget.ts` | 履歴を文脈長に収める                                                                  | なし                            |

## 3. モデルの読み込みとバックエンド

- バックエンドは `gpu-artisan`（WebGPU + ストリーミング読み込み）→ `gpu` → `cpu` の順に試す（`engineStore.load`）
  - `gpu-artisan` はファイル全体をメモリに載せずに読み込めるので、スマホでも 2〜3 GB のモデルを扱える
  - ストリーミングに非対応の形式なら `gpu` へ、`gpu` で失敗したら（GPU 専用モデルでなければ）`cpu` へ
  - 一度フォールバックで成功したバックエンドは、モデルごとに覚えて次回から最初に使う（`backendHints`）
- **Gemma 4 の Web 版（`*-web.litertlm`）は WebGPU 専用**。CPU では動かないので、読み込む前に止めて説明を出す
- WebGPU が使えない端末の主な原因（ヘルプにも書いている）
  - ブラウザが古い・GPU アクセラレーションがオフ（`chrome://gpu` で確認）
  - Android の「高度な保護」（Advanced Protection）がオンだと Chrome の WebGPU が止められる。オフにすると端末全体の保護が弱まるので、案内は「危険性を理解したうえで自己判断」にとどめる
- 読み込みエラーは `loadErrors.ts` で分類し（WebGPU なし・GPU 専用・メモリ不足・形式違いなど）、原文のメッセージに説明を添えて表示する

## 4. 生成

| モード    | 用途                           | 仕組み                                                                                                            |
| --------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `chat`    | チャット・会話練習             | 履歴の ID 列と設定が同じなら Conversation（KV キャッシュ）を使い回し、新しい発言だけを送る。違えば作り直す        |
| `oneshot` | 解説・判定・下書き・クイズなど | 毎回 Conversation を作って捨てる（履歴に混ざらない）。`keepChat` ならチャットの Conversation を残したまま別に作る |

- **タスクごとの推論設定**: 温度は Conversation を作るときに渡すので、タスクごとに変えても追加のコストはない（モデルの読み込み直しが必要なのは文脈長とバックエンドだけ）。形の決まった出力は低く（判定 0.2・下書き 0.3）、毎回違うものがほしい問題づくりは中くらい（0.7）、会話・解説は設定の値。0（貪欲法）は作り直しても同じ出力になるので避け、形が合わずに作り直すたびに少し上げる（`oneshot.ts` の `oneshotTemperature`・`runOneshotParsed`）
- **チャットの文脈を残す**: 単発の生成でチャットの Conversation を捨てると、次のチャット送信で履歴を全部読み直す（prefill）。2 つ目の Conversation を作れる環境では一時的な Conversation で生成して消し、作れなければ（例外になったら）そのモデルでは従来どおり捨てる。メモリを多く使うので設定でオフにできる
- **速さに効くもの**: 温度・top_k・top_p は速度にほぼ関係しない。効くのは出力の上限（`maxOutputTokens`）・入力の長さ・思考モード・KV キャッシュの再利用
- **排他**: エンジンは同時に 1 つしか生成できないので、`useAiBusy` で「誰が使っているか」を共有する。生成中はモデルの読み込み・解放もしない
- **受付と失敗**: 生成を受け付けられないとき（モデルがない・ほかの生成中）は、ユーザーの入力や既存の応答を消さない（送信は受け付けたかを返し、受け付けたときだけ入力欄を空にする。作り直しは新しい応答ができてから置き換える）
- **後回しにしてよい生成**: 評価への「ひとこと」のような小さな生成は、ほかの生成を頼まれたら止めて譲る（`preemptReaction`）
- **古い結果を混ぜない**: 非同期の結果（AI の判定など）は、依頼したときの対象（出題 ID など）と今の対象が同じときだけ反映する
- **履歴の長さ**: 文脈長（`maxNumTokens`）から応答の分・システムプロンプト・ツール定義・今回の発言を引いた量に収まるよう、古い履歴から削る（`historyBudget.ts`）。削る位置は数件単位にそろえ、KV キャッシュを毎回作り直さないようにする
- **ツール呼び出し（関数呼び出し）**: LiteRT-LM の `preface.tools`（`[{ type: 'function', function }]`）で宣言し、`chunk.tool_calls` を受けたらメインスレッドの関数を Comlink 経由で実行して `{ role: 'tool', content: [{ type: 'tool_response', name, response }] }` を返す。ループは Worker 側で最大 6 回
- **思考モード**: Gemma は設定の `enable_thinking`、Qwen3 は本文に `/no_think` を付けて止める（`modelQuirks.ts`）。思考はチャネルまたは本文先頭のタグで来るので `splitThinking` で分ける

## 5. AI に任せすぎない設計（このアプリの方針）

- **判断はプログラム、AI は上乗せ**: 復習の予定（FSRS）・正誤の判定・集計はプログラムが行う。AI はひとこと・解説・例文・相談を担当する
- **アプリの状態は構造化データで渡す**: 今日の学習状況や見ているカードを JSON にして渡す。数字は AI に作らせたり計算させたりしない（例: 今週のふりかえりは集計済みの数字を渡す）
- **AI の出力は検証する**: 判定・カードの下書き・クイズなどは JSON で出力させ、zod で形を検証し、内容もプログラムで確かめる（例: クイズの答えが出題した語句の活用形か）。使えなければ作り直す
- **確定はユーザーの操作で**: AI が提案したカードは「追加」を押して初めて保存する
- **アプリの使い方に答える（ヘルプの検索）**: ヘルプの文章から質問に関係する項目をプログラムが選んで（日本語は 2 文字ずつの重なりで検索）プロンプトに添え、AI にはそれだけをもとに答えさせる。書かれていないことは「見当たらない」と答えさせる（`features/help/helpTopics.ts`）
- **口調を混ぜない**: 教材づくりなどは性格（ペルソナ）を付けない中立のシステムプロンプトで生成する（`oneshot` の `plain`）

## 6. モデルの保存・共有

- 同じ `*.github.io` のサイト同士でモデルを共有する（[SHARED_MODEL_STORAGE.md](SHARED_MODEL_STORAGE.md)）
- ダウンロードは Worker の中で `fetch` → OPFS へストリーム書き込み（メモリに全部を載せない）
- **上書きに失敗しても既存のモデルは消さない**（他のサイトが保存したモデルかもしれない）
- 端末のファイルとしても書き出せる（`showSaveFilePicker`、無ければ Blob のダウンロード）

## 7. PWA とキャッシュ

- `vite-plugin-pwa`（Workbox）。アプリ本体はプリキャッシュ、Wasm（1 ファイル 20〜35 MB）は実際に使う 1 種類だけを実行時に `CacheFirst` で保存
- 生成中・ダウンロード中に勝手に再読み込みしないよう、更新は `registerType: 'prompt'` でユーザーが選ぶ
- manifest には `id` を明示する（変えると別のアプリ扱いになるので、決めたら変えない）
- Android の Chrome では、同じ github.io のアプリを多くインストールしていると「インストール済み」と表示されて追加できないことがある（Chrome 側の挙動）

## 8. ライセンス

- `scripts/generate-licenses.mjs` が依存パッケージのライセンスを集めて `THIRD_PARTY_NOTICES.md` と `public/licenses.json` を作る（CI で `--check`）
- AI モデルはアプリに含めない（ユーザーが入手する）。ヘルプに「モデルにはそれぞれの利用規約が適用される」と書く

## 9. テスト

- モデルそのものは CI で動かせないので、**Worker の外側をテストする**: 読み込みエラーの分類、カタログ、履歴の削り方、AI 出力の検証（zod とプログラムの確認）、ストアの排他
- OPFS は Node に無いので、`modelStorage.test.ts` のように最小限の代わり（`getFileHandle` / `createWritable` / `removeEntry`）を作ってテストする
- Worker のクライアントは `vi.mock('@/lib/llm/client', …)` で差し替えて、ストアの操作単位でテストする（`engineStore.test.ts`, `chatStore.test.ts`）
