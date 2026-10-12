import type { BackendKind } from '@/lib/llm/types';
import type {
  BackendSetting,
  NewCardOrder,
  ReactionMode,
  ThemeSetting,
  TypeAnswerMode,
  UserAge,
  UserGender,
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
  template: '決まったひとこと（モデル不要）',
  llm: 'AI が考える（モデルがないときは決まったひとこと）',
};

export const NEW_CARD_ORDER_LABELS: Record<NewCardOrder, string> = {
  pack: '教材の順番',
  random: 'ランダム',
};

export const TYPE_ANSWER_LABELS: Record<TypeAnswerMode, string> = {
  off: '出さない（「答えを書く」から書く）',
  recall: '単語・フレーズを答えるカードと穴埋め',
  all: 'すべてのカード（選択問題を除く）',
};

export const USER_GENDER_LABELS: Record<UserGender, string> = {
  '': '指定しない',
  female: '女性',
  male: '男性',
  other: 'その他',
};

export const USER_AGE_LABELS: Record<UserAge, string> = {
  '': '指定しない',
  child: '小学生',
  teen: '中高生',
  '20s': '20 代',
  '30s': '30 代',
  '40s': '40 代',
  '50s': '50 代',
  '60plus': '60 代以上',
};
