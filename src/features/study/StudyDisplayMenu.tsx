import { useState } from 'react';
import { Type } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Chip } from '@/components/ui/Chip';
import {
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
        description="変えるとすぐに反映されます（設定の「学習画面」と同じ）"
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
        </div>
      </BottomSheet>
    </>
  );
}
