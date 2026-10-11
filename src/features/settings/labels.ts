import type { BackendKind } from '@/lib/llm/types';
import type {
  BackendSetting,
  NewCardOrder,
  ReactionMode,
  ThemeSetting,
  TypeAnswerMode,
} from './settingsStore';

export const BACKEND_LABELS: Record<BackendKind, string> = {
  'gpu-artisan': 'GPU（Artisan）',
  gpu: 'GPU',
  cpu: 'CPU',
};

export const BACKEND_SETTING_LABELS: Record<BackendSetting, string> = {
  auto: '自動（推奨）',
  ...BACKEND_LABELS,
};

export const THEME_LABELS: Record<ThemeSetting, string> = {
  system: 'システムに合わせる',
  light: 'ライト',
  dark: 'ダーク',
};

export const REACTION_LABELS: Record<ReactionMode, string> = {
  off: 'なし',
  template: 'ひとこと（モデル不要・すぐ出る）',
  llm: 'AI が考える（モデルが必要）',
};

export const NEW_CARD_ORDER_LABELS: Record<NewCardOrder, string> = {
  pack: '教材の順番',
  random: 'ランダム',
};

export const TYPE_ANSWER_LABELS: Record<TypeAnswerMode, string> = {
  off: 'しない',
  recall: '単語・フレーズを答えるカードと穴埋め',
  all: 'すべてのカード（選択問題を除く）',
};
