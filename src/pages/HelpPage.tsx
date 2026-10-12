import type { ReactNode } from 'react';
import {
  BookOpen,
  Brain,
  Cpu,
  ExternalLink,
  Info,
  Keyboard,
  LifeBuoy,
  MonitorCheck,
  PlayCircle,
  Scale,
  Smartphone,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { PageBody, PageHeader } from '@/app/PageHeader';
import { useChat } from '@/features/chat/chatStore';
import { Card, Section } from '@/components/ui/Card';
import { ModelStatusChip } from '@/features/engine/ModelStatusChip';
import { Button } from '@/components/ui/Button';
import { openWelcome } from '@/features/welcome/welcomeStore';
import {
  FSRS_URL,
  FSRS_WIKI_URL,
  LITERTLM_DOCS_URL,
  LITERTLM_URL,
  APP_TAGLINE,
  APP_TITLE,
  REPOSITORY_URL,
  TRY_LOCAL_URL,
} from '@/lib/constants';
import { CapabilityCheck } from '@/features/help/CapabilityCheck';
import { LicenseList } from '@/features/help/LicenseList';
import { HELP_STEPS } from '@/features/help/helpTopics';

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

export default function HelpPage() {
  const [, navigate] = useLocation();
  /** チャットを使い方モードで開く */
  const askAi = () => {
    useChat.getState().setHelpMode(true);
    navigate('/chat');
  };
  return (
    <>
      <PageHeader title="ヘルプ" />
      <PageBody>
        <Card className="space-y-3 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <img src="./favicon.svg" alt="" className="size-12" />
            <div className="min-w-0">
              <h2 className="text-lg font-bold">{APP_TITLE}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">{APP_TAGLINE}</p>
            </div>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500 dark:text-slate-400">バージョン</dt>
            <dd className="font-mono">v{__APP_VERSION__}</dd>
            <dt className="text-slate-500 dark:text-slate-400">推論エンジン</dt>
            <dd className="font-mono">LiteRT-LM {__LITERTLM_VERSION__}</dd>
            <dt className="text-slate-500 dark:text-slate-400">AI モデル</dt>
            <dd>
              <ModelStatusChip className="max-w-56" />
            </dd>
            <dt className="text-slate-500 dark:text-slate-400">ライセンス</dt>
            <dd>MIT License</dd>
            <dt className="text-slate-500 dark:text-slate-400">ソースコード</dt>
            <dd className="min-w-0 truncate">
              <ExtLink href={REPOSITORY_URL}>GitHub</ExtLink>
            </dd>
          </dl>
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <Button size="sm" variant="secondary" onClick={askAi}>
              <LifeBuoy />
              AI に使い方を聞く
            </Button>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              このヘルプをもとに、AI が答えます（AI モデルが必要）
            </span>
          </div>
        </Card>

        <Section title="このアプリについて" icon={<Info />} collapsible storageKey="help">
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

        <Section collapsible storageKey="help" defaultOpen title="使い方" icon={<BookOpen />}>
          <ol className="space-y-3 px-4 py-3.5 sm:px-5">
            {HELP_STEPS.map((s, i) => (
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
          collapsible
          storageKey="help"
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

        <Section collapsible storageKey="help" title="キーボード操作（PC）" icon={<Keyboard />}>
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

        <Section collapsible storageKey="help" title="教材の形式" icon={<Wand2 />}>
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

        <Section collapsible storageKey="help" title="AI モデルについて" icon={<Sparkles />}>
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
          collapsible
          storageKey="help"
          title="動作環境チェック"
          icon={<MonitorCheck />}
          description="このブラウザの対応状況"
        >
          <CapabilityCheck />
        </Section>

        <Section collapsible storageKey="help" title="WebGPU が使えないとき" icon={<Cpu />}>
          <Body>
            <p>
              AI モデル（Gemma 4 の Web 版）は WebGPU 専用です。WebGPU が使えない端末では AI
              の機能（チャット・解説・例文クイズなど）は使えませんが、学習・記録・教材の管理はそのまま使えます。
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
              <li>
                Android で GPU があるのに使えない場合、OS の「高度な保護」（Advanced
                Protection）がオンになっていると、Chrome で WebGPU が止められていることがあります。
                オフにすると使えるようになる場合がありますが、
                <strong>端末全体の保護が弱まります</strong>
                。危険性を理解したうえで、ご自身の判断で試してください（無理にオフにする必要はありません。AI
                の機能を使わなければ、そのままで学習できます）。
              </li>
            </ul>
          </Body>
        </Section>

        <Section
          collapsible
          storageKey="help"
          title="ホーム画面に追加（アプリとして使う）"
          icon={<Smartphone />}
        >
          <Body>
            <p>
              ブラウザのメニューの「ホーム画面に追加」（「アプリをインストール」）で、アプリとして起動できます。一度開けば、オフラインでも起動できます。
            </p>
            <p className="text-slate-600 dark:text-slate-400">
              Android の Chrome
              では、同じサイト（masakiniwa.github.io）のアプリをいくつもインストールしていると、「このアプリはすでにインストールされています」と表示されて追加できないことがあります。ほかのアプリをアンインストールすると追加できる場合があります。追加できなくても、「ショートカットを作成」でホーム画面から開けます。
            </p>
          </Body>
        </Section>

        <Section collapsible storageKey="help" title="クレジットとライセンス" icon={<Scale />}>
          <Body>
            <p>
              <strong>{APP_TITLE}</strong> は{' '}
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
      </PageBody>
    </>
  );
}
