import {
  Boxes,
  CalendarDays,
  CircleHelp,
  House,
  Layers,
  Library,
  Settings,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
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
  { to: '/chat', label: 'AI', icon: Sparkles },
];

/** サブのナビゲーション（PC はサイドバー下部、スマホはヘッダーのメニュー） */
export const SUB_NAV_ITEMS: NavItem[] = [
  { to: '/models', label: 'AI モデル', icon: Boxes },
  { to: '/settings', label: '設定', icon: Settings },
  { to: '/help', label: 'ヘルプ', icon: CircleHelp },
];
