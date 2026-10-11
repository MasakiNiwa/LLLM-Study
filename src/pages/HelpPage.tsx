import type { ReactNode } from 'react';
import {
  BookOpen,
  Brain,
  Code2,
  Cpu,
  ExternalLink,
  Info,
  Keyboard,
  MonitorCheck,
  PlayCircle,
  Scale,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { PageBody, PageHeader } from '@/app/PageHeader';
import { Section } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { openWelcome } from '@/features/welcome/welcomeStore';
import {
  FSRS_URL,
  FSRS_WIKI_URL,
  LITERTLM_DOCS_URL,
  LITERTLM_URL,
  REPOSITORY_URL,
  TRY_LOCAL_URL,
} from '@/lib/constants';
import { CapabilityCheck } from '@/features/help/CapabilityCheck';
import { LicenseList } from '@/features/help/LicenseList';

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-accent-700 underline-offset-2 hover:underline dark:text-accent-300"
    >
      {children}
      <ExternalLink className="size-3.5 shrink-0" />
    </a>
  );
}

function Body({ children }: { children: ReactNode }) {
  return <div className="space-y-2 px-4 py-3.5 text-sm leading-relaxed sm:px-5">{children}</div>;
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-md border border-slate-300 bg-slate-100 px-1.5 py-0.5 font-mono text-xs dark:border-slate-600 dark:bg-slate-800">
      {children}
    </kbd>
  );
}

const STEPS = [
  {
    title: '教材を追加する',
    body: '「教材」画面の「サンプル」から教材を追加します。英単語・フレーズ・句動詞・英文法のサンプルがあります。',
  },
  {
    title: '毎日学習する',
    body: '「学習」画面でカードを見て思い出し、「答えを見る」で確認したら、思い出せたかどうかを 4 段階で評価します。次にいつ復習するかはアプリ（FSRS）が自動で決めます。',
  },
  {
    title: 'カレンダーで振り返る',
    body: '「カレンダー」画面で、毎日の学習量（色の濃さ）と、これからの復習予定（数字）を確認できます。日付をタップすると、その日に学習した項目や復習予定の項目が見られます。「記録」タブでは、カードの定着状況・復習予定の見通し・学習回数のグラフを見られます。',
  },
  {
    title: '答えを入力して確認する（任意）',
    body: '学習画面の ⌨ ボタン（または設定）で、答えを入力して答え合わせできます。判定はアプリが行い（つづりの小さな間違いは「惜しい」）、おすすめの評価を示します。言い換えなどは AI に判定してもらうこともできます。',
  },
  {
    title: '自分でカードを作る',
    body: '「教材」→「マイ教材」の「カードを作る」で、単語・フレーズ・一問一答のカードを作れます（マイカード）。AI モデルを読み込んでいれば、AI に意味や例文を下書きしてもらえます。',
  },
  {
    title: 'AI パートナーを呼ぶ（任意）',
    body: '「AI モデル」画面でモデル（おすすめは Gemma 4 E2B の Web 版）をダウンロードすると、カードの解説・例文づくり・覚え方の相談や、学習についてのチャットができます。AI はこの端末のブラウザの中で動き、内容が外部に送信されることはありません。',
  },
  {
    title: 'AI と一緒に練習する（任意）',
    body: 'AI モデルを読み込むと、ホームから「AI 例文クイズ」ができます。思い出しにくくなっている単語をアプリが選び、AI が教材にない例文で穴埋め問題を作ります（採点はアプリ。復習の予定は変わりません）。チャットで「〇〇をカードにして」と頼むと、AI がカードを提案し、「追加」を押すとマイカードに入ります。',
  },
  {
    title: '会話練習（任意）',
    body: 'AI モデルを読み込むと、ホームやチャット画面から「会話練習」ができます。場面（カフェ・ホテルなど）を選ぶと AI が役を演じて話しかけてきます。終わったら「添削してもらう」で直してもらい、覚えたい表現は「カードにする」でマイカードに追加できます。',
  },
  {
    title: '聞き取り・並べ替え',
    body: '単語・フレーズの教材は「教材」→ 詳細 →「出題のしかた」で「聞いて答える」を選ぶと、音声だけを聞いて答える聞き取りカードになります。並べ替えの問題は、語句をタップして正しい順に並べ、アプリが正誤を判定します（サンプル「英文法チェック」に収録）。',
  },
  {
    title: 'おさらい（記録に残らない練習）',
    body: '今日の学習が終わったら、「今日間違えたカード」「苦手なカード」「ランダムに」からおさらいできます。おさらいの評価は記録されず、復習の予定も変わらないので、試験前の確認などに気軽に使えます。',
  },
  {
    title: '長文読解',
    body: '本文（文章・会話文）つきの問題では、本文が問題の上に表示され、答えを見ると訳も確認できます（サンプル「英語の長文読解 入門」）。「AI で作る」で「長文読解にする」をオンにすると、好きなテーマの長文読解を作ってもらえます。',
  },
  {
    title: '教材とカードの管理',
    body: '「教材」画面では、教材や項目を検索したり、分野で絞り込んだりできます。教材の「詳細」から、項目ごとの学習状況の確認、出題の停止・再開、教材の書き出し（JSON）ができます。学習中のカードは右上の「出題しない」で止められます。',
  },
  {
    title: 'バックアップ',
    body: '学習データはこの端末のブラウザの中だけにあります。「設定」→「データ」の「書き出す」で、ときどきファイルに保存しておくと安心です（しばらく書き出していないとホームでお知らせします）。',
  },
  {
    title: '表（CSV・TSV）から取り込む',
    body: '手持ちの単語リストは「教材」→「取り込む」→「表（CSV・TSV）」で取り込めます。1 列目に単語や問題、2 列目に意味や答え、3 列目に補足を並べます。Excel やスプレッドシートのセルをコピーして貼り付けるか、Anki・Quizlet などで書き出したファイルを選んでください。同じ名前で取り込み直すと更新になり、学習記録は引き継がれます。',
  },
  {
    title: '今週のふりかえり',
    body: '「カレンダー」→「記録」の上に、この 7 日間のまとめ（先週との比較）が出ます。AI モデルを読み込んでいれば、AI パートナーがその数字をもとに、よかった点・苦手な項目・来週の目標をコメントしてくれます。',
  },
  {
    title: '教材を AI に作ってもらう',
    body: '「教材」画面の「AI で作る」で条件を入れてプロンプトをコピーし、ChatGPT・Claude・Gemini などの外部の AI に貼り付けます。返ってきた JSON を「取り込む」に貼り付ければ、自分だけの教材で学習できます。',
  },
];

export default function HelpPage() {
  return (
    <>
      <PageHeader title="ヘルプ" />
      <PageBody>
        <Section title="ローカルLLM学習アプリについて" icon={<Info />}>
          <Body>
            <p>
              <strong>自分のペースで使える、ローカル LLM タイプの学習アプリ</strong>です。
              記憶のアルゴリズム（FSRS）で復習のタイミングを管理し、その上にブラウザの中で動くローカル
              AI がパートナーとして乗っています。
            </p>
            <p>
              復習の予定や正誤の判定はプログラムが正確に行い、AI
              はリアクション・解説・例文づくり・相談などを担当します。 AI
              にはアプリの状態（今日の学習状況や見ているカード）を構造化データで渡し、学習記録が必要なときは
              AI がツールで調べます。
            </p>
            <p>
              教材・学習記録・AI
              モデルはすべてこの端末のブラウザ内に保存され、外部のサーバーに送信されることはありません。
            </p>
          </Body>
        </Section>

        <Section title="使い方" icon={<BookOpen />}>
          <ol className="space-y-3 px-4 py-3.5 sm:px-5">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-100 text-xs font-bold text-accent-800 dark:bg-accent-900/50 dark:text-accent-200">
                  {i + 1}
                </span>
                <div className="text-sm">
                  <div className="font-medium">{s.title}</div>
                  <p className="mt-0.5 text-slate-600 dark:text-slate-400">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-t border-slate-200 px-4 py-3 sm:px-5 dark:border-slate-800">
            <Button size="sm" variant="secondary" onClick={openWelcome}>
              <PlayCircle />
              はじめての案内をもう一度見る
            </Button>
          </div>
        </Section>

        <Section
          title="評価のしかた"
          icon={<Brain />}
          description="正直に評価するほど、復習のタイミングが合ってきます"
        >
          <Body>
            <ul className="space-y-1.5">
              <li>
                <strong className="text-rose-600">もう一度</strong>:
                思い出せなかった（数分後にもう一度出ます）
              </li>
              <li>
                <strong className="text-amber-600">難しい</strong>:
                思い出せたが、かなり時間がかかった
              </li>
              <li>
                <strong className="text-emerald-600">正解</strong>:
                少し考えて思い出せた（迷ったらこれ）
              </li>
              <li>
                <strong className="text-sky-600">簡単</strong>: すぐに思い出せた
              </li>
            </ul>
            <p className="text-slate-600 dark:text-slate-400">
              FSRS（Free Spaced Repetition
              Scheduler）は、カードごとの「記憶の安定度」と「難しさ」を推定し、思い出せる確率が目標の記憶率（既定
              90%）まで下がる頃に復習を予定します。詳しくは{' '}
              <ExtLink href={FSRS_WIKI_URL}>FSRS の解説</ExtLink> を参照してください。
            </p>
          </Body>
        </Section>

        <Section title="キーボード操作（PC）" icon={<Keyboard />}>
          <Body>
            <ul className="space-y-1.5">
              <li>
                <Kbd>Space</Kbd> / <Kbd>Enter</Kbd>: 答えを見る
              </li>
              <li>
                <Kbd>1</Kbd>〜<Kbd>4</Kbd>: もう一度・難しい・正解・簡単
              </li>
              <li>
                <Kbd>Ctrl</Kbd> + <Kbd>Z</Kbd>: 直前の評価を取り消す
              </li>
            </ul>
          </Body>
        </Section>

        <Section title="教材の形式" icon={<Wand2 />}>
          <Body>
            <p>
              教材は JSON 形式（教材パック）です。単語・フレーズ・一問一答・穴埋め・選択問題の 5
              種類の項目に対応しており、英語以外の分野にも使えます。 形式の詳しい説明は「教材」→「AI
              で作る」から仕様書（.md）をダウンロードするか、
              <ExtLink href={`${REPOSITORY_URL}/blob/main/docs/STUDY_PACK_FORMAT.md`}>
                教材パック形式
              </ExtLink>{' '}
              を参照してください。
            </p>
            <p className="text-slate-600 dark:text-slate-400">
              同じ ID の教材を取り込み直すと「更新」になり、同じ項目 ID の学習記録は引き継がれます。
            </p>
          </Body>
        </Section>

        <Section title="AI モデルについて" icon={<Sparkles />}>
          <Body>
            <p>
              AI は Google の <ExtLink href={LITERTLM_URL}>LiteRT-LM</ExtLink> を Web Worker +
              WebGPU で動かしています。推奨環境は WebGPU に対応した最新の Chrome /
              Edge（PC・Android）です。 詳しくは{' '}
              <ExtLink href={LITERTLM_DOCS_URL}>LiteRT-LM のドキュメント</ExtLink>{' '}
              を参照してください。
            </p>
            <p>
              ダウンロードしたモデルは、同じ github.io の他のサイト（
              <ExtLink href={TRY_LOCAL_URL}>Try Local</ExtLink>{' '}
              など）と共通の保存領域に置かれ、どのサイトからでも使えます。端末のファイルとして書き出す（バックアップ）こともできます。
            </p>
          </Body>
        </Section>

        <Section
          title="動作環境チェック"
          icon={<MonitorCheck />}
          description="このブラウザの対応状況"
        >
          <CapabilityCheck />
        </Section>

        <Section title="WebGPU が使えないとき" icon={<Cpu />}>
          <Body>
            <p>
              設定のバックエンドが「自動」なら、WebGPU が使えない端末では
              CPU（WebAssembly）で実行します。ただし Gemma 4 の Web 版は WebGPU 専用のため、CPU では
              Qwen3 0.6B など CPU にも対応したモデルを使ってください。
            </p>
            <ul className="list-disc space-y-1.5 pl-5 text-slate-600 dark:text-slate-400">
              <li>Chrome / Edge を最新版に更新する（Android は Android 12 以降）</li>
              <li>
                アドレスバーに <code className="font-mono text-xs">chrome://gpu</code>{' '}
                と入力し、「WebGPU」の状態を確認する
              </li>
              <li>
                PC では <code className="font-mono text-xs">chrome://settings/system</code>
                の「グラフィック アクセラレーションが使用可能な場合は使用する」をオンにする
              </li>
            </ul>
          </Body>
        </Section>

        <Section title="ソースコード" icon={<Code2 />}>
          <Body>
            <p>
              このアプリはオープンソースです。不具合の報告や改善の提案は GitHub
              リポジトリまでお願いします。
            </p>
            <p>
              <ExtLink href={REPOSITORY_URL}>{REPOSITORY_URL.replace('https://', '')}</ExtLink>
            </p>
          </Body>
        </Section>

        <Section title="クレジットとライセンス" icon={<Scale />}>
          <Body>
            <p>
              <strong>ローカルLLM学習アプリ</strong>は{' '}
              <ExtLink href={`${REPOSITORY_URL}/blob/main/LICENSE`}>MIT License</ExtLink>{' '}
              で公開されています。
            </p>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                推論エンジン: Google の <strong>LiteRT-LM</strong>（@litert-lm/core, Apache License
                2.0）
              </li>
              <li>
                記憶のアルゴリズム: <ExtLink href={FSRS_URL}>ts-fsrs</ExtLink>（FSRS-6, MIT
                License）— Open Spaced Repetition の皆さんによる研究と実装
              </li>
              <li>
                サンプル教材: 本アプリの作者が作成したものです（AI
                を利用して作成したものを含みます）。作り方や出典は、各教材の詳細に表示しています
              </li>
              <li>
                AI
                モデルは本アプリには含まれていません。利用するモデルにはそれぞれのライセンス・利用規約（例:
                Gemma の利用規約、Apache License 2.0）が適用されます
              </li>
            </ul>
            <p className="text-slate-600 dark:text-slate-400">
              以下は本アプリが利用しているオープンソースソフトウェアの一覧です（太字は直接の依存）。名前をタップするとライセンス全文を表示します。
            </p>
          </Body>
          <LicenseList />
        </Section>

        <p className="pb-2 text-center text-xs text-slate-400">
          ローカルLLM学習アプリ v{__APP_VERSION__} · LiteRT-LM {__LITERTLM_VERSION__}
        </p>
      </PageBody>
    </>
  );
}
