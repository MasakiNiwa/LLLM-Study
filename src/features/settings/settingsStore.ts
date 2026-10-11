import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { STORAGE_PREFIX } from '@/lib/constants';
import type { BackendKind, ConversationSettings } from '@/lib/llm/types';
import type { SchedulerOptions } from '@/lib/srs/scheduler';

export type ThemeSetting = 'system' | 'light' | 'dark';

/** auto: WebGPU が使えれば GPU（Artisan）、使えなければ CPU */
export type BackendSetting = 'auto' | BackendKind;

/** 評価したときのひとこと。template: アプリが用意した言葉（モデル不要）、llm: AI が考える */
export type ReactionMode = 'off' | 'template' | 'llm';

export type NewCardOrder = 'pack' | 'random';

/** 答えを入力して答え合わせするカード。recall: 単語・フレーズを答えるカードと穴埋め、all: すべて */
export type TypeAnswerMode = 'off' | 'recall' | 'all';

export interface Settings extends Omit<ConversationSettings, 'systemPrompt'> {
  // ---- 学習（アルゴリズム） ----
  newPerDay: number;
  maxReviewsPerDay: number;
  /** true: 1 日の上限を設けない（新しいカードも復習もあるだけ出す） */
  noDailyLimit: boolean;
  /** 学習する教材を 1 つに絞る（null: 有効なすべての教材） */
  focusPackId: string | null;
  /** 目標の記憶保持率 */
  retention: number;
  maxIntervalDays: number;
  fuzz: boolean;
  shortTerm: boolean;
  /** 1 日の始まりの時刻（0〜6 時） */
  dayStartHour: number;
  newCardOrder: NewCardOrder;
  // ---- 学習（表示・音声） ----
  showIntervals: boolean;
  typeAnswer: TypeAnswerMode;
  autoSpeak: boolean;
  speechRate: number;
  /** 読み上げの声（voiceURI。空なら自動） */
  speechVoice: string;
  // ---- AI ----
  persona: string;
  /** persona = 'custom' のときの性格の説明 */
  customPersona: string;
  /** ユーザーが追加する指示（システムプロンプトの末尾に付ける） */
  extraInstructions: string;
  reaction: ReactionMode;
  /** AI にアプリの状態（今日の学習状況など）を伝える */
  shareStudyState: boolean;
  /** AI にツール（学習記録の検索など）を使わせる */
  useTools: boolean;
  // ---- エンジン（変更後はモデルの再読み込みが必要） ----
  backend: BackendSetting;
  maxNumTokens: number;
  // ---- モデル管理 ----
  saveImportedModels: boolean;
  autoLoadLastModel: boolean;
  lastModelName: string | null;
  /** 自動設定時に、フォールバックで読み込めたバックエンドをモデルごとに覚えておく */
  backendHints: Record<string, BackendKind>;
  // ---- 表示・操作 ----
  theme: ThemeSetting;
  enterToSend: boolean;
  showStats: boolean;
  /** アプリのアイコンに今日の残りの枚数を出す（ホーム画面に追加したとき） */
  appBadge: boolean;
  // ---- バックアップ ----
  /** 最後に学習データを書き出した日時 */
  lastBackupAt: number | null;
  /** バックアップの案内を出さない期限 */
  backupSnoozeUntil: number | null;
  // ---- はじめての案内 ----
  /** はじめての案内を終えた（または教材がすでにあって不要だった） */
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  newPerDay: 15,
  maxReviewsPerDay: 200,
  noDailyLimit: false,
  focusPackId: null,
  retention: 0.9,
  maxIntervalDays: 36500,
  fuzz: true,
  shortTerm: true,
  dayStartHour: 4,
  newCardOrder: 'pack',

  showIntervals: true,
  typeAnswer: 'off',
  autoSpeak: false,
  speechRate: 0.9,
  speechVoice: '',

  persona: 'buddy',
  customPersona: '',
  extraInstructions: '',
  reaction: 'template',
  shareStudyState: true,
  useTools: true,

  temperature: 1.0,
  topK: 64,
  topP: 0.95,
  maxOutputTokens: 1024,
  enableThinking: false,

  backend: 'auto',
  maxNumTokens: 4096,

  saveImportedModels: true,
  autoLoadLastModel: true,
  lastModelName: null,
  backendHints: {},

  theme: 'system',
  enterToSend: true,
  showStats: false,
  appBadge: true,

  lastBackupAt: null,
  backupSnoozeUntil: null,

  onboarded: false,
};

interface SettingsState extends Settings {
  update: (patch: Partial<Settings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      update: (patch) => set(patch),
      // 前回のモデル名などはリセット対象外（自動読み込みのため）
      reset: () =>
        set((s) => ({
          ...DEFAULT_SETTINGS,
          lastModelName: s.lastModelName,
          backendHints: s.backendHints,
          lastBackupAt: s.lastBackupAt,
          onboarded: s.onboarded,
        })),
    }),
    {
      name: `${STORAGE_PREFIX}:settings`,
      version: 1,
      partialize: ({ update: _u, reset: _r, ...rest }) => rest,
    },
  ),
);

export function getSchedulerOptions(s: Settings): SchedulerOptions {
  return {
    retention: s.retention,
    maxIntervalDays: s.maxIntervalDays,
    fuzz: s.fuzz,
    shortTerm: s.shortTerm,
  };
}
