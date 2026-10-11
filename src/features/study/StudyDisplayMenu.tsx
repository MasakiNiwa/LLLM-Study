import { useEffect, useRef, useState } from 'react';
import { Type } from 'lucide-react';
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
  const ref = useRef<HTMLDivElement>(null);
  const scale = useSettings((s) => s.studyFontScale);
  const compact = useSettings((s) => s.studyCompact);
  const update = useSettings((s) => s.update);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="文字の大きさ・表示"
        title="文字の大きさ・表示"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex size-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-200/70 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <Type className="size-5" />
      </button>
      {open && (
        <div className="absolute top-11 right-0 z-30 w-64 animate-fade-in space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-slate-500">カードの文字の大きさ</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(STUDY_FONT_SCALES) as StudyFontScale[]).map((k) => (
                <Chip key={k} active={scale === k} onClick={() => update({ studyFontScale: k })}>
                  {STUDY_FONT_SCALES[k].label}
                </Chip>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-slate-500">余白を詰める</div>
            <div className="flex flex-wrap gap-1.5">
              {(Object.keys(STUDY_COMPACT_LABELS) as StudyCompact[]).map((k) => (
                <Chip key={k} active={compact === k} onClick={() => update({ studyCompact: k })}>
                  {k === 'auto' ? '自動' : k === 'on' ? '詰める' : '詰めない'}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
