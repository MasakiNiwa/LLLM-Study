# クラウド AI の API をブラウザから使う（キーはユーザーが持ち込む）

LLLM Study は、端末内で動く AI（ローカル LLM）に加えて、**ユーザー自身の API キー**でクラウド AI（Gemini API・OpenAI API・Claude（Anthropic API）・OpenRouter）を使えます。
GitHub Pages で公開しているのでサーバーはありません。キーの保管も API の呼び出しも、すべてブラウザの中で行います。

この文書は、サーバーのない静的サイトで「キーの持ち込み（BYOK: Bring Your Own Key）」を安全側に作るための考え方と作り方です。
ほかのリポジトリでも、このままの方針で使えます。

## 1. 前提: ブラウザに置いたキーを「完全に」守る方法はない

同じページで悪意のあるスクリプトが動けば、使っている最中のキーは使われてしまいます。どんな暗号化も、ページ自体が乗っ取られたら防げません。
そこで、次の 2 つを重ねます。

1. **漏れにくくする**（保存の暗号化・送信先の限定・依存を増やさない・キーを外に出さない）
2. **漏れても被害を小さくする**（キーの制限・専用のキー・いつでも作り直せること）

あわせて、**送る内容の説明と同意**を必ず取ります（キーの安全とは別の、データの扱いの問題）。

## 2. 全体の形

```text
画面（チャット・解説・ひとこと…）
   │ GenerateRequest（システムプロンプト・履歴・発話・ツール）── 端末内とクラウドで同じ形
   ▼
features/cloud/aiClient.ts（入口。設定の「AI の接続先」で振り分ける）
   ├─ 端末内:   lib/llm/client.ts → Web Worker（LiteRT-LM）
   └─ クラウド: lib/cloud/providers.ts（接続先の一覧）
                  ├─ lib/cloud/gemini.ts     → fetch（ストリーミング）→ Gemini API
                  ├─ lib/cloud/openai.ts     → openaiCompat.ts → OpenAI API
                  ├─ lib/cloud/openrouter.ts → openaiCompat.ts → OpenRouter
                  └─ lib/cloud/anthropic.ts  → fetch（ストリーミング）→ Anthropic API（Claude）
                    ▲ キーは lib/cloud/keyVault.ts のメモリーから受け取る（接続先ごとに別のキー）
```

- 呼び出し側（チャットなど）は**どちらの AI かを区別しない**。入口を 1 つにして、生成の要求と結果の形をそろえる
- 正誤の判定・学習記録・データの保存は、これまでどおり**アプリ（プログラム）が行う**。クラウド AI は解説や会話だけを受け持つ（AI がまちがっても記録は壊れない）
- クラウドが回数の上限（429）・サーバーの不調・通信エラーで答えられず、まだ何も表示していなければ、端末内の AI が読み込み済みなら**端末内で答え直す**
- キーがロック中で端末内の AI があれば、端末内で答える（ロックの解除はユーザーが行う）

| ファイル                               | 役割                                                                            |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `src/lib/cloud/keyVault.ts`            | キーの暗号化・保存・解除・ロック（WebCrypto）。解除したキーはメモリーにだけ置く |
| `src/lib/cloud/gemini.ts`              | Gemini API の呼び出し（ストリーミング・考える過程・ツール・エラーの言い換え）   |
| `src/lib/cloud/openai.ts`              | OpenAI API の呼び出し（Chat Completions・推論モデル・ツール・エラーの言い換え） |
| `src/lib/cloud/openaiCompat.ts`        | OpenAI 互換の Chat Completions の共通部分（OpenAI と OpenRouter が使う）        |
| `src/lib/cloud/anthropic.ts`           | Claude（Anthropic API）の呼び出し（Messages API・考える過程・ツール）           |
| `src/lib/cloud/openrouter.ts`          | OpenRouter の呼び出し・モデルの一覧（料金・ツール対応）                         |
| `src/lib/cloud/openrouterAuth.ts`      | 「OpenRouter でログイン」（OAuth PKCE でキーを受け取る）                        |
| `src/lib/cloud/providers.ts`           | 接続先の一覧（名前・モデル一覧・既定のモデル・生成）。入口はここから選ぶ        |
| `src/lib/cloud/errors.ts`              | 接続先に共通のエラー（`CloudError`: 状態コードと「答え直せるか」）              |
| `src/lib/cloud/sse.ts`                 | ストリーミング応答（Server-Sent Events）の読み取り                              |
| `src/features/cloud/aiClient.ts`       | 入口（端末内とクラウドの振り分け・答え直し）と「AI を使えるか」の判定           |
| `src/features/cloud/cloudStore.ts`     | 画面用の状態（保存済みか・解除済みか・モデルの一覧）。キーそのものは持たない    |
| `src/features/cloud/AiSwitcher.tsx`    | 使う場面での切り替え（モデルのチップから開く。接続先・モデル・その場で解除）    |
| `src/features/cloud/ModelPicker.tsx`   | モデルの選択（一覧・直接入力・OpenRouter の検索つきシート）                     |
| `src/features/cloud/CloudSettings.tsx` | 「AI モデル」画面の設定（接続先・キーの登録と解除・モデルの選択・同意）         |
| `build/vite-plugin-csp.ts`             | 本番ビルドの CSP（送信先の限定）                                                |

## 3. キーの保管（既定は「アプリの合言葉で暗号化して、この端末に保存」）

| 保存のしかた                       | 保存するもの                                 | 向いている場面                       |
| ---------------------------------- | -------------------------------------------- | ------------------------------------ |
| **アプリの合言葉で暗号化（既定）** | 暗号文・ソルト・IV・キーの末尾 4 文字だけ    | 自分の端末。次からは合言葉だけで使う |
| 今回だけ                           | 何も保存しない（メモリーだけ。タブで消える） | 共用のパソコン・試しに使うとき       |

- **合言葉はアプリに 1 つ（すべての接続先のキーで共通）**。1 回入れれば、保存したすべてのキーが使える
- 合言葉から **PBKDF2（SHA-256・60 万回）** で鍵を作り、**AES-GCM（256 bit）** で各キーを暗号化する。合言葉もキーも保存しない
  - 保管庫の情報（`lllm-study:cloud-vault`）: ソルト・繰り返し回数・**決まった文を暗号化したもの**（合言葉が合っているかを確かめる）
  - 各キー（`lllm-study:cloud-key:接続先`）: その鍵で暗号化した暗号文・IV・末尾 4 文字
  - 解除中はメモリーに**取り出せない形の鍵（`extractable: false` の CryptoKey）**だけを置き、合言葉の文字列は持たない。解除中に登録するキーは、その鍵でそのまま暗号化する（合言葉の入力は不要）
  - 合言葉を変えるときは、すべてのキーを新しい合言葉で暗号化し直す。忘れたときは、キーと保管庫の情報を消してやり直す
  - 以前の形（キーごとに合言葉で暗号化）のキーは、その合言葉で解除したときにアプリの合言葉の形に移す
- 開くたびにロックされている。合言葉で解除すると、キーは**モジュールの変数（メモリー）にだけ**置く
  - 状態管理（zustand）・設定・バックアップ・書き出し・ログ・AI への入力には**一切入れない**
  - 画面では伏せ字。どのキーかは末尾 4 文字だけで見分ける
- 合言葉を忘れたら、キーを削除して登録し直す（元に戻す方法は作らない）
- 登録する前に、モデルの一覧を取ってキーを確かめる（トークンを使わない呼び出し）。正しくないキーは保存しない

**なぜ暗号化するか**: github.io の公開 URL（`ユーザー名.github.io`）は、同じアカウントの**ほかのリポジトリの Pages と保存領域（オリジン）を共有**します。
ほかのアプリに弱点があると、こちらの localStorage も読まれえます。暗号化しておけば、読まれても合言葉なしでは使えません。
端末の盗難・バックアップファイルの流出・同じ端末のほかの利用者に対しても同じです。
（独自ドメインで公開すればオリジンを分けられます。この問題を根本から無くしたいときは検討する）

## 4. 送信先を限定する（Content Security Policy）

GitHub Pages では HTTP ヘッダーを設定できないので、**本番ビルドの index.html に `<meta http-equiv="Content-Security-Policy">` を入れます**（`build/vite-plugin-csp.ts`）。

```text
default-src 'self';
script-src 'self' 'sha256-…（初回描画前のテーマ用スクリプト）' 'wasm-unsafe-eval';
connect-src 'self' https://generativelanguage.googleapis.com https://api.openai.com https://api.anthropic.com https://openrouter.ai https://huggingface.co https://*.huggingface.co https://*.hf.co;
style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; worker-src 'self' blob:;
object-src 'none'; base-uri 'self'; form-action 'self'; …
```

- いちばん大事なのは **connect-src**。ページから通信できる先を、クラウド AI の API とモデルの入手元だけにする。万一悪いスクリプトが入り込んでも、キーや学習データを**ほかのサイトへ送り出せない**
- インラインの `<script>` は**内容のハッシュだけ**を許可する（`'unsafe-inline'` を使わない）。ハッシュはビルドのときに自動で計算する
- `eval` は許可しない（Wasm のコンパイルに必要な `'wasm-unsafe-eval'` だけ）
- 開発サーバー（`vite dev`）は HMR がインラインのスクリプトを使うので、**本番ビルドだけ**に入れる
- **新しい送信先（別の AI の API など）を増やすときは、`CONNECT_SOURCES` に足す**。足し忘れるとブラウザが通信を止める（コンソールに「Refused to connect」と出る）
- meta の CSP では `frame-ancestors` などが使えない（ヘッダーでしか効かない）点に注意

## 5. キーの送り方

- **キーは URL に入れず、ヘッダーで送る**（Gemini は `x-goog-api-key`、OpenAI・OpenRouter は `Authorization: Bearer`、Claude は `x-api-key`）。URL は履歴・ログ・Referer に残りやすい
- SDK は使わず **fetch だけ**で書く。依存パッケージを増やさない（サプライチェーンの危険を減らす）うえ、送る内容を 1 ファイルで見渡せる
- エラーの文はアプリで言い換え、キーを表示しない
- `<meta name="referrer" content="strict-origin-when-cross-origin">` で、API にはオリジン（`https://ユーザー名.github.io/`）だけを Referer として送る（キーの「ウェブサイト」制限が効くように）

## 6. 漏れても被害を小さくする（ユーザーに案内する設定）

アプリの「キーを安全に使うために」に、次の設定を案内しています。

- **アプリ専用のキーを作る**。ほかの用途と使い回さない
- **Gemini のキーに制限をかける**（Google Cloud コンソールの「認証情報」でキーを開く）
  - アプリケーションの制限: 「ウェブサイト」にして `https://ユーザー名.github.io/*` を追加する
    （ブラウザはほかのオリジンへの通信でオリジンだけを Referer にするので、`/リポジトリ名/*` のようなパスまでの指定では一致しない）
  - API の制限: Generative Language API だけを許可する
  - AI Studio で作ったキーは Google Cloud のプロジェクトの中にあるが、コンソールに表示されないことがある。そのときは AI Studio でプロジェクトを読み込む（インポートする）と制限を設定できる。請求先（課金）を設定しなければ無料枠のまま
- **OpenAI のキーを絞る**（platform.openai.com）
  - このアプリ専用の**プロジェクト**を作り、その中でキーを作る
  - プロジェクトの **Limits で利用額の上限（予算）** を設定する。従量課金なので、漏れたときの被害を金額で止められる
  - キーの権限は **Restricted** にして、Models を Read、Model capabilities を Write だけにする（一覧の取得と生成だけ）
  - OpenAI のキーには「ウェブサイト」の制限がない。使わないときはロックし、心配なら作り直す
- **Claude のキーを絞る**（Claude Console）: 専用の**ワークスペース**でキーを作り、ワークスペースの **Limits で上限額**を設定する
- **OpenRouter のキーを絞る**: キーに **Credit limit（使える上限額）** を設定する。Settings → Privacy で、送った内容を学習に使う会社を許可するかを決める（無料のモデルの多くは許可が要る）
- 心配なときは、いつでもキーを無効化して作り直す
- 共用のパソコンでは「今回だけ」を選ぶか、使い終わったらロックする

## 7. 送る内容の説明と同意

はじめてクラウド AI を選ぶときに、次を説明して同意してもらいます（同意は端末ごと。バックアップからは戻さない）。

- AI に頼んだ内容（問題と答え・ユーザーの答え・チャット・学習の状況）が、その会社に送られる
- **Gemini API の無料枠では、送った内容が Google のサービス改善に使われ、人が読むこともある**（有料枠では使われない）。個人情報や社外秘の内容は送らない
- **OpenAI API は従量課金**（使った分だけ請求される）。API に送った内容は原則として学習に使われないが、不正利用の監視のため一定期間保存される（最新の規約を確かめる）
- **Claude（Anthropic API）は従量課金**。API に送った内容は原則として学習に使われず、安全のため一定期間保存される（最新の規約を確かめる）
- **OpenRouter は、OpenRouter と選んだモデルの会社の両方に送られる**。無料のモデル（`:free`）では、送った内容が学習に使われることがある
- 同意は接続先ごとに取る（Gemini に同意しても、OpenAI を選ぶときにあらためて説明する）
- キーは暗号化してその端末にだけ保存し、その会社以外には送らない。学習記録・教材は端末内に残る
- 応答には「クラウド」の印を付け、どちらの AI が答えたか分かるようにする

## 8. 設定・バックアップとの関係

- 「AI の接続先」（`aiProvider`）「使うモデル」（`cloudModels`: 接続先ごと）「同意したか」（`cloudConsents`: 接続先ごと）は**端末ごとの設定**（バックアップの設定に含めない。ほかの端末で復元しても勝手にクラウドに接続しない）
- 暗号化したキーは設定とは別の localStorage のキー（`lllm-study:cloud-key:接続先`。例: `lllm-study:cloud-key:openai`）に置き、バックアップにも含めない
- 「最近使ったモデル」（`recentCloudModels`）・OpenRouter の ★（`openrouterFavorites`）・応答ごとの AI（`taskModels`）も端末ごとの設定
- 設定の版 4 で、以前の `geminiModel` / `cloudConsent` を `cloudModels` / `cloudConsents` に移す（`migrateSettings`）

## 9. Gemini API の呼び出し（`src/lib/cloud/gemini.ts`）

- `POST /v1beta/models/{モデル}:streamGenerateContent?alt=sse`（ストリーミング）
- 履歴は毎回すべて送る（クラウドは会話を覚えていない）。役割は `user` / `model`、システムプロンプトは `systemInstruction`
- **モデルの世代で受け付ける設定が違う**ので、送る設定は最小限にする
  - `topK` / `topP` は送らない（端末内のモデル向けの値。クラウドのモデルは既定のほうが安定する）
  - 考える過程: オンなら `thinkingConfig: { includeThoughts: true }`（`thought: true` の部分で届く）。オフで止められるのは 2.5 Flash 系だけ（`thinkingBudget: 0`）。ほかのモデルには止める設定を送らない
  - 考えるモデルは考える分も出力の上限に数えるので、上限に下限（4096）を設ける
  - それでも 400 で断られたら、最小限の設定（温度・考える設定なし）で送り直し、そのモデルでは次からも最小限で送る
- ツールの引数がないときは `parameters` を付けない（中身のない OBJECT は受け付けられない）
- ツール（関数呼び出し）: モデルが `functionCall` を返したら、アプリのツールを実行して `functionResponse` を返し、続きを生成する。**モデルが返した部分（署名 `thoughtSignature` を含む）はそのまま履歴に戻す**
- モデルの一覧: `GET /v1beta/models`。文章の生成に使えるもの（`generateContent`）だけを出し、既定は安定版の Flash
- エラー: 400（キーが違う）・403（キーの制限・API が無効）・404（モデルがない）・429（上限。待てば使える）・5xx（サーバーの不調）を言い換える

## 10. OpenAI API の呼び出し（`src/lib/cloud/openai.ts`）

- `POST /v1/chat/completions`（`stream: true`、`stream_options: { include_usage: true }` で使ったトークン数も受け取る）。キーは `Authorization: Bearer`
- 履歴は毎回すべて送る。システムプロンプトは `system` の役割、出力の上限は `max_completion_tokens`
- **推論モデル（`o1`・`o3`・`o4-mini`・`gpt-5` 系）は受け付ける設定が違う**
  - `temperature` を送らない（既定以外は断られる）
  - 考える過程のオン・オフは `reasoning_effort`（`high` / `low`）で表す。考える過程の中身は API から返らない
  - 考える分も出力の上限に数えるので、上限に下限（4096。考えるときは 16384）を設ける
  - それでも 400 で断られたら、最小限の設定で送り直し、そのモデルでは次からも最小限で送る
- ツール: ストリーミングでは `tool_calls` が**番号（index）ごとに少しずつ**届くので、つなげてから実行する。結果は `tool` の役割（`tool_call_id` 付き）で返し、続きを生成する
- モデルの一覧: `GET /v1/models`。文章の生成に使う系統（`gpt-`・`o` + 数字・`chatgpt-`）だけを出し、音声・画像・埋め込みなどは除く。既定は日付の付かない `mini`（例: `gpt-5-mini`）
- エラー: 401（キーが違う）・403（権限・地域）・404（モデルがない・使う権限がない）・429 を言い換える
  - 429 のうち `insufficient_quota`（残高・予算の不足）は**待っても直らない**ので答え直さない。それ以外の 429 と 5xx は端末内の AI で答え直せる
- ブラウザからの直接の呼び出し（CORS）は OpenAI が許可している

## 11. Claude（Anthropic API）の呼び出し（`src/lib/cloud/anthropic.ts`）

- `POST /v1/messages`（`stream: true`）。キーは `x-api-key`、版は `anthropic-version` ヘッダー
- **ブラウザから直接呼ぶには `anthropic-dangerous-direct-browser-access: true` が要る**（キーはユーザー自身のものなので、この使い方に当てはまる）
- `temperature` などは送らない（新しい版の API は受け付けない）。システムプロンプトは `system`
- 考える過程: オンなら `thinking: { type: 'adaptive', display: 'summarized' }`（要約が `thinking_delta` で届く）と `output_config.effort: 'high'`、オフなら `effort: 'low'`。考えるのを止められないモデルもあるので、深さで速さを決める
- 出力の上限 `max_tokens` は必須。考える分も数えるので下限（4096。考えるときは 16384）を設ける
- ストリームのイベント: `message_start`（入力のトークン数）→ `content_block_start` / `content_block_delta`（`text_delta`・`thinking_delta`・`signature_delta`・`input_json_delta`）/ `content_block_stop` → `message_delta`（`stop_reason`・出力のトークン数）
- ツール: `stop_reason` が `tool_use` なら実行し、**モデルが返したブロック（考える過程と署名を含む）をそのまま assistant に戻し**、結果は `tool_result` を**1 つの user の発話にまとめて**返す
- エラー: 401・403・404・429（待てば使える）・529（混雑。待てば使える）・残高不足（待っても直らない）を言い換える。`stop_reason: 'refusal'` は「応答を控えた」と伝える
- 400 で断られたら最小限の設定（考える設定・深さなし）で送り直す（古いモデルは `effort` を受け付けないことがある）
- モデルの一覧: `GET /v1/models`（新しい順）。既定は新しい Haiku（速くて安い）

## 12. OpenRouter の呼び出し（`src/lib/cloud/openrouter.ts`・`openrouterAuth.ts`）

- 1 つのキーで多くの会社のモデルを使える。生成は OpenAI 互換の Chat Completions（`openaiCompat.ts` を OpenAI と共通で使う）
  - 出力の上限は `max_tokens`。考える過程はオンのときだけ `reasoning: { effort: 'high' }` で頼み、`delta.reasoning` で受け取る
  - どのアプリからの利用かを `HTTP-Referer`・`X-Title` で伝える（任意。キーとは関係ない）
  - ツールに対応していないモデルで断られたら（404・「tool」）、ツールなしで送り直す
  - 402（クレジット不足）は待っても直らない。429（無料のモデルは上限が小さい）・5xx は答え直せる。ストリームの途中で届く `error` も知らせる
- モデルの一覧は**キーなしで**取れる（`GET /api/v1/models`）。料金・ツール対応・考える過程の対応を読み取り、検索・絞り込み（無料・ツール対応・考える）・★・最近使ったものから選べるシートで出す。キーは `GET /api/v1/key` で確かめる
- 既定のモデルは、ツールを使えて安い有料の軽いモデル（無料のモデルは回数の上限が小さく入れ替わりも多いので既定にしない）
- **「OpenRouter でログイン」（OAuth PKCE）**: サーバーなしでキーを受け取れる（貼り付け不要。スマホで便利）
  1. `code_verifier` を作って **sessionStorage**（そのタブだけ）に置き、`https://openrouter.ai/auth?callback_url=…&code_challenge=…&code_challenge_method=S256` へ移動する
  2. 戻ってきた URL の `?code=` を、**すぐに URL から消してから**（再読み込みで二度使わない）`POST /api/v1/auth/keys` で `code_verifier` と一緒に送り、キーを受け取る。15 分を過ぎた・このタブで始めていないログインは無視する
  3. 受け取ったキーは**保存せずメモリーにだけ置き**（`holdPendingKey`）、合言葉を決めてもらってから暗号化して保存する
  - 戻り先は https か localhost でないと受け付けられないので、それ以外ではボタンを出さない

## 13. 使う場面での切り替え（`src/features/cloud/AiSwitcher.tsx`）

- ホーム・チャットなどに出ている**モデルのチップを押すと、使う AI を選ぶシート**が開く
  - 接続先: 端末内の AI と、キーを登録した（同意済みの）クラウド AI
  - ロック中ならその場でアプリの合言葉を入れて解除できる（すべてのキーがまとめて使える）
  - モデルもその場で選べる（OpenRouter は検索つきのシート）。「最近使ったモデル」（実際に答えたもの）から 1 回で戻せる
- キーの登録・削除・説明と同意は「AI モデル」画面だけで行う（その場の切り替えでは、外部への送信先を新しく増やさない）

### 応答ごとの AI（`src/features/cloud/TaskModels.tsx`・`aiClient.ts` の `taskRoute`）

- 応答の種類（`AiTask`: ひとこと・解説など・チャット・会話練習・ふりかえり）ごとに、接続先とモデルを変えられる（`taskModels`）
  - 例: 回数の多い「ひとこと」は安いモデルや OpenRouter の無料のモデル、解説は賢いモデル
- 呼び出し側は `ai.generate(req, onEvent, onToolCall, task)` と種類を渡すだけ。決めていない種類・使えないとき（キーがロック中・端末内のモデルが無い）は、いつもの AI で答える

## 14. ほかの AI に広げるとき

- **入口（`aiClient.ts`）とやりとりの形（`GenerateRequest` / `GenerateEvent`）は変えずに**、`lib/cloud/` に接続を足し、`providers.ts` に登録する
  - OpenAI 互換（Groq・Mistral など）: `openaiCompat.ts` の `createChatCompletions` に、送信先・設定の作り方・エラーの言い換えを渡すだけ
  - 説明（名前・キーの入手先・同意・安全の案内）は `features/cloud/providerInfo.tsx` に足す
- キーの保管は `keyVault.ts` の `CloudProviderId` を増やすだけで、同じ暗号化を使える
- **CSP の `CONNECT_SOURCES` に送信先を足す**ことを忘れない
- 同意の説明は、その会社のデータの扱い（学習に使うか）に合わせて書き分ける

## 15. 新しいリポジトリでのチェックリスト

- [ ] キーは既定で暗号化して保存（PBKDF2 + AES-GCM）。合言葉はアプリに 1 つにして、1 回で全部解除できるようにする。「今回だけ」も選べる。解除したキーと取り出せない形の鍵はメモリーだけ
- [ ] キーを設定・バックアップ・書き出し・ログ・AI への入力に入れない。画面では伏せ字
- [ ] 本番ビルドに CSP（meta）を入れ、connect-src を API とモデルの入手元だけにする。インラインのスクリプトはハッシュで許可
- [ ] キーはヘッダーで送る（URL に入れない）。SDK を使わず fetch で書く
- [ ] 送る内容の説明と同意。無料枠のデータの扱いを明記する（接続先ごとに）
- [ ] ログイン（OAuth）でキーを受け取るときは PKCE を使い、code はすぐ URL から消す。受け取ったキーも暗号化してから保存する
- [ ] キーの制限（ウェブサイト・API・権限）・専用のキー・利用額の上限を案内する
- [ ] 正誤の判定や保存はプログラムが行い、AI は解説・会話に限る。クラウドが使えないときの戻り先（端末内の AI・テンプレート）を用意する
- [ ] 本番ビルドをブラウザで開き、CSP の違反（コンソールの「Refused to …」）が出ないことを確かめる。API への通信はテストで差し替えて確かめる
