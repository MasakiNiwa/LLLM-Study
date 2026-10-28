import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CloudProviderId } from '@/lib/cloud/keyVault';
import { STORAGE_PREFIX } from '@/lib/constants';
import type { BackendKind, ConversationSettings } from '@/lib/llm/types';
import type { SchedulerOptions } from '@/lib/srs/scheduler';

export type ThemeSetting = 'system' | 'light' | 'dark';
/** ダークモードの配色。neutral: 色味のないグレー、warm: 暖かいグレー、vivid: 以前の鮮やかな配色 */
export type DarkPalette = 'neutral' | 'warm' | 'vivid';

/** auto: WebGPU が使えれば GPU（Artisan）、使えなければ CPU */
export type BackendSetting = 'auto' | BackendKind;

/** 評価したときのひとこと。template: アプリが用意した言葉（モデル不要）、llm: AI が考える */
export type ReactionMode = 'off' | 'template' | 'llm';

export type NewCardOrder = 'pack' | 'random';

/** AI の応答に反映するユーザーのこと（任意。空は指定しない） */
export type UserGender = '' | 'female' | 'male' | 'other';
export type UserAge = '' | 'child' | 'teen' | '20s' | '30s' | '40s' | '50s' | '60plus';

/** 答えを入力して答え合わせするカード。recall: 単語・フレーズを答えるカードと穴埋め、all: すべて */
export type TypeAnswerMode = 'off' | 'recall' | 'all';
/** 学習画面のカードの文字の大きさ */
export type StudyFontScale = 'sm' | 'md' | 'lg' | 'xl';
export const STUDY_FONT_SCALES: Record<StudyFontScale, { label: string; zoom: number }> = {
  sm: { label: '小', zoom: 0.85 },
  md: { label: '標準', zoom: 1 },
  lg: { label: '大', zoom: 1.15 },
  xl: { label: '特大', zoom: 1.3 },
};
/** テストモード: 1 問の制限時間（秒）の上限 */
export const CARD_LIMIT_MAX = 3600;
/** 学習全体の制限時間（分）の上限 */
export const SESSION_LIMIT_MAX = 600;
/** 学習画面の余白を詰める（auto: 画面の高さが低いときだけ） */
export type StudyCompact = 'auto' | 'on' | 'off';
export const STUDY_COMPACT_LABELS: Record<StudyCompact, string> = {
  auto: '自動（画面が小さいとき）',
  on: 'いつも詰める',
  off: '詰めない',
};

/** AI の接続先（端末内のモデルか、クラウド AI のどれか） */
export type AiProvider = 'local' | CloudProviderId;

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
  studyFontScale: StudyFontScale;
  studyCompact: StudyCompact;
  /** 問題ごとの経過時間を出す */
  showCardTimer: boolean;
  /** 学習全体の経過時間を出す */
  showSessionTimer: boolean;
  /** テストモード: 1 問の制限時間（秒。0 はなし）。時間切れで答えを表示する */
  cardTimeLimit: number;
  /** 学習全体の制限時間（分。0 はなし）。時間になったら、評価中のカードで終える */
  sessionTimeLimit: number;
  autoSpeak: boolean;
  speechRate: number;
  /** 読み上げの声（voiceURI。空なら自動） */
  speechVoice: string;
  // ---- AI ----
  persona: string;
  /** persona = 'custom' のときの性格の説明 */
  customPersona: string;
  /** ユーザーの性別・年齢層（任意。AI の話題や言葉づかいの参考にする） */
  userGender: UserGender;
  userAge: UserAge;
  /** ユーザーが追加する指示（システムプロンプトの末尾に付ける） */
  extraInstructions: string;
  reaction: ReactionMode;
  /** AI にアプリの状態（今日の学習状況など）を伝える */
  shareStudyState: boolean;
  /** AI にツール（学習記録の検索など）を使わせる */
  useTools: boolean;
  /**
   * タスクごとに温度を変える（判定・カードの下書きは低く、例文クイズは中くらい）。
   * false なら、すべての応答に設定の温度を使う
   */
  taskTemperature: boolean;
  /** 単発の生成（解説・ひとことなど）のあとも、チャットの文脈（KV キャッシュ）を残す（実験的） */
  keepChatContext: boolean;
  // ---- エンジン（変更後はモデルの再読み込みが必要） ----
  backend: BackendSetting;
  maxNumTokens: number;
  /** AI の接続先（端末内のモデルか、クラウド AI の API か） */
  aiProvider: AiProvider;
  /** クラウド AI ごとの使うモデル（無ければ、キーを登録したときに既定のモデルを選ぶ） */
  cloudModels: Partial<Record<CloudProviderId, string>>;
  /** クラウド AI ごとに、送る内容の説明に同意したか */
  cloudConsents: Partial<Record<CloudProviderId, boolean>>;
  /** 最近使ったクラウド AI のモデル（「接続先|モデル」。新しい順） */
  recentCloudModels: string[];
  /** ★ を付けた OpenRouter のモデル */
  openrouterFavorites: string[];
  // ---- モデル管理 ----
  saveImportedModels: boolean;
  autoLoadLastModel: boolean;
  lastModelName: string | null;
  /** 自動設定時に、フォールバックで読み込めたバックエンドをモデルごとに覚えておく */
  backendHints: Record<string, BackendKind>;
  // ---- 表示・操作 ----
  theme: ThemeSetting;
  darkPalette: DarkPalette;
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
  studyFontScale: 'md',
  studyCompact: 'auto',
  showCardTimer: false,
  showSessionTimer: false,
  cardTimeLimit: 0,
  sessionTimeLimit: 0,
  autoSpeak: false,
  speechRate: 0.9,
  speechVoice: '',

  persona: 'buddy',
  customPersona: '',
  userGender: '',
  userAge: '',
  extraInstructions: '',
  reaction: 'llm',
  shareStudyState: true,
  useTools: true,
  taskTemperature: true,
  keepChatContext: true,

  temperature: 1.0,
  topK: 64,
  topP: 0.95,
  maxOutputTokens: 1024,
  enableThinking: false,

  backend: 'auto',
  aiProvider: 'local',
  cloudModels: {},
  cloudConsents: {},
  recentCloudModels: [],
  openrouterFavorites: [],
  maxNumTokens: 4096,

  saveImportedModels: true,
  autoLoadLastModel: true,
  lastModelName: null,
  backendHints: {},

  theme: 'system',
  darkPalette: 'neutral',
  enterToSend: true,
  showStats: true,
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
      version: 4,
      partialize: ({ update: _u, reset: _r, ...rest }) => rest,
      // v2: 生成の統計の表示を既定でオンにした（以前の既定のオフのままの人もオンにする）
      // v3: 答えを見たときのひとことの既定を「AI が考える」にした（以前の既定のままの人も）
      migrate: (persisted, version) => migrateSettings(persisted, version) as SettingsState,
    },
  ),
);

/** 保存されていた設定を今の形にする（persist の migrate。テストのため外に出している） */
export function migrateSettings(persisted: unknown, version: number): Partial<Settings> {
  let s = persisted as Partial<Settings>;
  if (version < 2) s = { ...s, showStats: true };
  if (version < 3 && s.reaction === 'template') s = { ...s, reaction: 'llm' };
  if (version < 4) {
    // v4: クラウド AI を複数にした（Gemini だけの設定をクラウド AI ごとの設定に移す）
    const old = s as Partial<Settings> & { geminiModel?: string; cloudConsent?: boolean };
    const { geminiModel, cloudConsent, ...rest } = old;
    s = {
      ...rest,
      cloudModels: geminiModel ? { gemini: geminiModel } : {},
      cloudConsents: cloudConsent ? { gemini: true } : {},
    };
  }
  return s;
}

export function getSchedulerOptions(s: Settings): SchedulerOptions {
  return {
    retention: s.retention,
    maxIntervalDays: s.maxIntervalDays,
    fuzz: s.fuzz,
    shortTerm: s.shortTerm,
  };
}

/** 端末ごとに決める設定（バックアップに含めない）: モデル・エンジン・読み上げの声・案内の状態など */
const DEVICE_ONLY: (keyof Settings)[] = [
  'backend',
  // クラウド AI の接続はキーと一緒に端末ごとに決める（バックアップから戻しても勝手に接続しない）
  'aiProvider',
  'cloudModels',
  'cloudConsents',
  'recentCloudModels',
  'openrouterFavorites',
  'maxNumTokens',
  'saveImportedModels',
  'autoLoadLastModel',
  'lastModelName',
  'backendHints',
  'speechVoice',
  'lastBackupAt',
  'backupSnoozeUntil',
  'onboarded',
];

/** バックアップに含める設定（学習の上限・1 日の始まり・AI の性格・表示など） */
export function portableSettings(s: Settings): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (!DEVICE_ONLY.includes(key)) out[key] = s[key];
  }
  return out;
}

/**
 * バックアップの設定から、使えるものだけを取り出す（知らない項目・型の違う値・端末ごとの設定は無視）。
 */
export function sanitizeSettings(raw: Record<string, unknown>): Partial<Settings> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    if (DEVICE_ONLY.includes(key) || !(key in raw)) continue;
    const value = raw[key];
    const def = DEFAULT_SETTINGS[key];
    const ok =
      def === null
        ? value === null || typeof value === 'string'
        : typeof def === 'number'
          ? typeof value === 'number' && Number.isFinite(value)
          : typeof value === typeof def && (typeof def !== 'object' || value !== null);
    if (ok) out[key] = value;
  }
  return out as Partial<Settings>;
}
