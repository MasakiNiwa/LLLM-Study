import { useState } from 'react';
import { Type } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Chip } from '@/components/ui/Chip';
import {
  CARD_TIME_LIMITS,
  SESSION_TIME_LIMITS,
  cardLimitLabel,
  sessionLimitLabel,
  STUDY_COMPACT_LABELS,
  STUDY_FONT_SCALES,
  useSettings,
  type StudyCompact,
  type StudyFontScale,
} from '@/features/settings/settingsStore';

/** 学習画面のヘッダーから、カードの文字の大きさと余白をすぐ変えるメニュー */
export function StudyDisplayMenu() {
  const [open, setOpen] = useState(false);
  const scale = useSettings((s) => s.studyFontScale);
  const compact = useSettings((s) => s.studyCompact);
  const showCard = useSettings((s) => s.showCardTimer);
  const showSession = useSettings((s) => s.showSessionTimer);
  const cardLimit = useSettings((s) => s.cardTimeLimit);
  const sessionLimit = useSettings((s) => s.sessionTimeLimit);
  const update = useSettings((s) => s.update);

  return (
    <>
      <button
        type="button"
        aria-label="文字の大きさ・表示"
        title="文字の大きさ・表示"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="flex size-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Type className="size-5" />
      </button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="学習画面の表示"
        description="変えるとすぐに反映されます（設定の「学習画面」「時間を測る」と同じ）"
        expandable
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <div className="text-sm font-medium">カードの文字の大きさ</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(STUDY_FONT_SCALES) as StudyFontScale[]).map((k) => (
                <Chip key={k} active={scale === k} onClick={() => update({ studyFontScale: k })}>
                  {STUDY_FONT_SCALES[k].label}
                </Chip>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-sm font-medium">余白を詰める</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(STUDY_COMPACT_LABELS) as StudyCompact[]).map((k) => (
                <Chip key={k} active={compact === k} onClick={() => update({ studyCompact: k })}>
                  {STUDY_COMPACT_LABELS[k]}
                </Chip>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-sm font-medium">時間を表示</div>
            <div className="flex flex-wrap gap-1.5">
              <Chip active={showCard} onClick={() => update({ showCardTimer: !showCard })}>
                問題ごと
              </Chip>
              <Chip active={showSession} onClick={() => update({ showSessionTimer: !showSession })}>
                学習全体
              </Chip>
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-sm font-medium">1 問の制限時間（テストモード）</div>
            <div className="flex flex-wrap gap-1.5">
              {CARD_TIME_LIMITS.map((n) => (
                <Chip key={n} active={cardLimit === n} onClick={() => update({ cardTimeLimit: n })}>
                  {cardLimitLabel(n)}
                </Chip>
              ))}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              時間切れになると答えを表示します
            </p>
          </div>
          <div className="space-y-1.5">
            <div className="text-sm font-medium">学習全体の制限時間</div>
            <div className="flex flex-wrap gap-1.5">
              {SESSION_TIME_LIMITS.map((n) => (
                <Chip
                  key={n}
                  active={sessionLimit === n}
                  onClick={() => update({ sessionTimeLimit: n })}
                >
                  {sessionLimitLabel(n)}
                </Chip>
              ))}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              学習を始めてからの時間で数えます。時間になったら、評価中のカードで終えます
            </p>
          </div>
        </div>
      </BottomSheet>
    </>
  );
}
