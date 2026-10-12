/**
 * AI に渡すシステムプロンプトと会話設定。
 * 性格（ペルソナ）＋アプリの中での役割＋守ってほしいルールを組み立てる。
 */
import type { ConversationSettings } from '@/lib/llm/types';
import type { Settings } from '@/features/settings/settingsStore';
import { getPersona } from './personas';

export function buildSystemPrompt(s: Settings, options: { tools: boolean }): string {
  const persona = getPersona(s.persona, s.customPersona);
  const lines = [
    'あなたは「LLLM Study」（ローカル LLM の学習アプリ）の中にいる学習パートナーです。',
    `【性格】${persona.style}`,
    '【役割】ユーザーの学習に寄り添い、リアクションしたり、分かることは解説したり、一緒に悩んだり、例文を作ったり、質問を掘り下げたりします。',
    '【ルール】',
    '- 復習のスケジュールはアプリのアルゴリズム（FSRS）が決めます。あなたが日程を決めたり約束したりしないでください。',
    '- アプリの状態は <app_state> の JSON で渡されることがあります。数字や記録はそこ（またはツールの結果）にあるものだけを使い、作り話をしないでください。',
    '- 分からないこと・自信がないことは正直にそう伝えてください。',
    '- 日本語で、スマホで読みやすいよう短め（3〜6 文程度）に答えてください。必要なら箇条書きを使います。',
    '- 英語の例文には和訳を添えてください。',
  ];
  if (options.tools) {
    lines.push(
      '- 学習記録や教材の内容が必要なときは、用意されたツールを使って調べてから答えてください。',
      '- アプリの使い方を聞かれたら、search_help でヘルプを調べてから答えてください（ヘルプにないことは推測で答えない）。',
      '- 新しい単語や表現を教えたときや、ユーザーが覚えたいと言ったときは propose_card でカードを提案できます（保存はユーザーが決めます）。',
    );
  }
  if (s.extraInstructions.trim()) {
    lines.push('【ユーザーからの追加の指示】', s.extraInstructions.trim());
  }
  return lines.join('\n');
}

export function getConversationSettings(
  s: Settings,
  options: { tools: boolean },
): ConversationSettings {
  return {
    systemPrompt: buildSystemPrompt(s, options),
    temperature: s.temperature,
    topK: s.topK,
    topP: s.topP,
    maxOutputTokens: s.maxOutputTokens,
    enableThinking: s.enableThinking,
  };
}
