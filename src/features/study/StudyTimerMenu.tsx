import { useState } from 'react';
import { Timer } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Chip } from '@/components/ui/Chip';
import { DurationField } from '@/components/ui/DurationField';
import { cn } from '@/lib/utils/cn';
import { CARD_LIMIT_MAX, SESSION_LIMIT_MAX, useSettings } from '@/features/settings/settingsStore';

/** 時間の表示と制限時間の設定（学習画面のシートと設定画面で共通） */
export function TimerOptions() {
  const showCard = useSettings((s) => s.showCardTimer);
  const showSession = useSettings((s) => s.showSessionTimer);
  const cardLimit = useSettings((s) => s.cardTimeLimit);
  const sessionLimit = useSettings((s) => s.sessionTimeLimit);
  const update = useSettings((s) => s.update);
  return (
    <div className="space-y-5">
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
        <DurationField
          value={cardLimit}
          onChange={(v) => update({ cardTimeLimit: v })}
          unit="秒"
          sliderMax={180}
          step={5}
          inputMax={CARD_LIMIT_MAX}
          label="1 問の制限時間"
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          残り時間を数え、時間切れになると答えを表示します。空欄（0）でなし
        </p>
      </div>
      <div className="space-y-1.5">
        <div className="text-sm font-medium">学習全体の制限時間</div>
        <DurationField
          value={sessionLimit}
          onChange={(v) => update({ sessionTimeLimit: v })}
          unit="分"
          sliderMax={120}
          step={1}
          inputMax={SESSION_LIMIT_MAX}
          label="学習全体の制限時間"
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          学習を始めてからの時間で数え、時間になったら評価中のカードで終えます。空欄（0）でなし
        </p>
      </div>
    </div>
  );
}

/** 学習画面のヘッダーから、時間の表示と制限時間をすぐ変えるメニュー */
export function StudyTimerMenu() {
  const [open, setOpen] = useState(false);
  // 何か時間の設定が入っていれば、アイコンに色を付けて分かるようにする
  const active = useSettings(
    (s) => s.showCardTimer || s.showSessionTimer || s.cardTimeLimit > 0 || s.sessionTimeLimit > 0,
  );
  return (
    <>
      <button
        type="button"
        aria-label="時間を測る・制限時間"
        title="時間を測る・制限時間"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn(
          'flex size-10 items-center justify-center rounded-xl hover:bg-slate-200/70 dark:hover:bg-slate-800',
          active ? 'text-accent-600 dark:text-accent-400' : 'text-slate-600 dark:text-slate-300',
        )}
      >
        <Timer className="size-5" />
      </button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="時間を測る"
        description="変えるとすぐに反映されます（設定の「時間を測る」と同じ）"
      >
        <TimerOptions />
      </BottomSheet>
    </>
  );
}
