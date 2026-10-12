import {
  Boxes,
  CalendarDays,
  CircleHelp,
  House,
  Layers,
  Library,
  MessagesSquare,
  Settings,
  Sparkles,
  Wand2,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** 短い説明（AI ツールの選択画面などで表示） */
  description?: string;
}

/**
 * メインのナビゲーション（スマホの下部ナビ・PC のサイドバー）。
 * ページを追加するときはここと App.tsx のルートに追加する。
 */
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'ホーム', icon: House },
  { to: '/study', label: '学習', icon: Layers },
  { to: '/library', label: '教材', icon: Library },
  { to: '/calendar', label: 'カレンダー', icon: CalendarDays },
  { to: '/chat', label: 'チャット', icon: Sparkles },
];

/**
 * AI を使う練習のページ（チャット以外）。スマホは下部ナビの「AI練習」から選ぶ。
 * AI の機能を増やすときはここに足すと、スマホの選択画面と PC のサイドバーの両方に出る。
 */
export const AI_TOOL_ITEMS: NavItem[] = [
  {
    to: '/quiz',
    label: '例文クイズ',
    icon: Wand2,
    description: '忘れかけた単語を、AI が作る新しい例文で確かめる',
  },
  {
    to: '/practice',
    label: '会話練習',
    icon: MessagesSquare,
    description: '語学・ビジネス・口頭試問などを AI とロールプレイ。終わったらふりかえり',
  },
];

export const MODELS_ITEM: NavItem = { to: '/models', label: 'AI モデル', icon: Boxes };
export const SETTINGS_ITEM: NavItem = { to: '/settings', label: '設定', icon: Settings };
export const HELP_ITEM: NavItem = { to: '/help', label: 'ヘルプ', icon: CircleHelp };

/** PC のサイドバー下部 */
export const SUB_NAV_ITEMS: NavItem[] = [MODELS_ITEM, SETTINGS_ITEM, HELP_ITEM];
