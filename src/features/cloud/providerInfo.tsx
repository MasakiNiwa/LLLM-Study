/**
 * クラウド AI の接続先ごとの説明（名前・キーの入手先・送る内容の同意・キーを安全に使うための設定）。
 * 接続の本体は lib/cloud/providers.ts。
 */
import type { ReactNode } from 'react';
import type { CloudProviderId } from '@/lib/cloud/keyVault';
import { Code, ExtLink } from './ExtLink';

export interface ProviderInfo {
  label: string;
  hint: string;
  company: string;
  keyPage: { url: string; name: string };
  keyPlaceholder: string;
  /** 送る内容の説明（はじめて選ぶときに同意してもらう） */
  consent: ReactNode;
  /** キーを安全に使うための設定 */
  safety: ReactNode[];
}

const consentTail = (company: string) => (
  <p>
    API キーは合言葉で暗号化してこの端末にだけ保存し、{company}
    以外には送りません。学習記録・教材はこれまでどおり端末内に保存されます。
  </p>
);

const SENT_CONTENT =
  'AI に頼んだ内容（カードの問題と答え・あなたの答え・チャットの文章・学習の状況）';

export const PROVIDERS: Record<CloudProviderId, ProviderInfo> = {
  gemini: {
    label: 'Gemini API',
    hint: 'Google のクラウド AI。無料枠があります',
    company: 'Google',
    keyPage: { url: 'https://aistudio.google.com/apikey', name: 'Google AI Studio' },
    keyPlaceholder: 'AIza…',
    consent: (
      <>
        <p>Gemini API を使うと、{SENT_CONTENT}が Google に送られます。</p>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>
            無料枠では、送った内容が Google のサービスの改善に使われ、人が読むこともあります。
          </strong>
          個人情報や社外秘の内容は送らないでください。
        </p>
        {consentTail('Google')}
      </>
    ),
    safety: [
      'このアプリ専用のキーを作り、ほかの用途と使い回さないでください。',
      <>
        <ExtLink href="https://console.cloud.google.com/apis/credentials">
          Google Cloud の「認証情報」
        </ExtLink>
        でキーを開き、「アプリケーションの制限」を「ウェブサイト」にして{' '}
        <Code>https://masakiniwa.github.io/*</Code> を追加し、「API の制限」で Generative Language
        API だけを許可すると、キーが漏れても他のサイトからは使えません。
      </>,
      'AI Studio で作ったキーは Google Cloud のプロジェクトの中にあります。Google Cloud の画面にキーが出ないときは、AI Studio でそのプロジェクトを読み込む（インポートする）と、制限を設定できるようになります。請求先（課金）を設定しなければ無料枠のまま使えます。制限をかけなくてもアプリは使えます。',
      '心配なときは、いつでもキーを削除（AI Studio で無効化）して作り直せます。',
    ],
  },
  openai: {
    label: 'OpenAI API',
    hint: 'ChatGPT の OpenAI のモデル。使った分だけ課金されます',
    company: 'OpenAI',
    keyPage: { url: 'https://platform.openai.com/api-keys', name: 'OpenAI の API keys' },
    keyPlaceholder: 'sk-…',
    consent: (
      <>
        <p>OpenAI API を使うと、{SENT_CONTENT}が OpenAI に送られます。</p>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>使った分だけ料金がかかります（トークン数に応じた従量課金）。</strong>
          OpenAI の説明では、API
          に送った内容は原則として学習には使われず、不正利用の監視のため一定期間保存されます（詳しくは
          OpenAI の規約を確認してください）。個人情報や社外秘の内容は送らないでください。
        </p>
        {consentTail('OpenAI')}
      </>
    ),
    safety: [
      <>
        OpenAI の画面で<strong>このアプリ専用のプロジェクト</strong>
        を作り、そのプロジェクトでキーを作ってください。
      </>,
      <>
        プロジェクトの「Limits」で<strong>月の予算（使える上限額）</strong>
        を設定すると、万一キーが漏れても使われる金額を抑えられます。
      </>,
      <>
        キーを作るときに権限を「Restricted」にして、Models を Read、Model capabilities を Write
        だけにすると、ほかの機能には使えないキーになります。
      </>,
      'OpenAI のキーには「このサイトからだけ」という制限がありません。使わないときはロックし、心配なときはすぐキーを削除（OpenAI の画面で無効化）して作り直してください。',
    ],
  },
  anthropic: {
    label: 'Claude API',
    hint: 'Anthropic の Claude。使った分だけ課金されます',
    company: 'Anthropic',
    keyPage: {
      url: 'https://console.anthropic.com/settings/keys',
      name: 'Claude Console の API keys',
    },
    keyPlaceholder: 'sk-ant-…',
    consent: (
      <>
        <p>Claude API を使うと、{SENT_CONTENT}が Anthropic に送られます。</p>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>使った分だけ料金がかかります（トークン数に応じた従量課金）。</strong>
          Anthropic の説明では、API
          に送った内容は原則として学習には使われず、安全のため一定期間保存されます（詳しくは
          Anthropic の規約を確認してください）。個人情報や社外秘の内容は送らないでください。
        </p>
        {consentTail('Anthropic')}
      </>
    ),
    safety: [
      <>
        Claude Console で<strong>このアプリ専用のワークスペース</strong>
        を作り、そのワークスペースでキーを作ってください。
      </>,
      <>
        ワークスペースの「Limits」で<strong>使える上限額</strong>
        を設定すると、万一キーが漏れても使われる金額を抑えられます。
      </>,
      'Claude のキーには「このサイトからだけ」という制限がありません。使わないときはロックし、心配なときはすぐキーを削除（Console で無効化）して作り直してください。',
    ],
  },
  openrouter: {
    label: 'OpenRouter',
    hint: '1 つのキーで多くの会社のモデル。無料のモデルもあります',
    company: 'OpenRouter',
    keyPage: { url: 'https://openrouter.ai/settings/keys', name: 'OpenRouter の Keys' },
    keyPlaceholder: 'sk-or-…',
    consent: (
      <>
        <p>
          OpenRouter を使うと、{SENT_CONTENT}が OpenRouter
          と、選んだモデルを動かす会社（Google・OpenAI・Anthropic など）に送られます。
        </p>
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          <strong>
            無料のモデル（:free）では、送った内容がその会社のモデルの学習に使われることがあります。
          </strong>
          有料のモデルは、入れたクレジットから使った分だけ引かれます。どの会社に送ってよいかは
          OpenRouter の Settings → Privacy
          で決められます。個人情報や社外秘の内容は送らないでください。
        </p>
        {consentTail('OpenRouter')}
      </>
    ),
    safety: [
      <>
        キーに<strong>使える上限額（Credit limit）</strong>
        を設定してください（OpenRouter の Keys
        でキーを開く）。万一漏れても、使われる金額を抑えられます。
      </>,
      'Settings → Privacy で、送った内容を学習に使う会社を許可するかどうかを決められます。無料のモデルの多くは、許可しないと使えません。',
      '「OpenRouter でログイン」で受け取ったキーも、Keys の一覧に出ます。使わなくなったら削除してください。',
      'OpenRouter のキーには「このサイトからだけ」という制限がありません。使わないときはロックしてください。',
    ],
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS) as CloudProviderId[];
