import { useEffect, useState } from 'react';
import { db } from '@/lib/db/db';
import { cn } from '@/lib/utils/cn';
import { getPersona } from '@/features/ai/personas';
import { reactionPrompt } from '@/features/ai/assist';
import { isAiBusy } from '@/features/ai/aiBusy';
import { runOneshot } from '@/features/ai/oneshot';
import { cardForLlm } from '@/features/ai/studyContext';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings } from '@/features/settings/settingsStore';
import { useStudy, type LastRating } from './studyStore';

/** 1 回の評価に対するひとこと（評価ごとに key を変えて作り直す） */
function Bubble({ last, llm }: { last: LastRating; llm: boolean }) {
  const personaId = useSettings((s) => s.persona);
  const custom = useSettings((s) => s.customPersona);
  const [visible, setVisible] = useState(true);
  const [aiText, setAiText] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let hide = setTimeout(() => setVisible(false), 4500);
    if (llm && !isAiBusy()) {
      void (async () => {
        const card = await db.cards.get(last.cardId);
        const json = card
          ? await cardForLlm(card, { revealed: true, userAnswer: last.userAnswer })
          : null;
        try {
          const r = await runOneshot({
            task: 'reaction',
            prompt: reactionPrompt(last.grade, json, {
              done: last.done,
              correctStreak: last.correctStreak,
            }),
            maxOutputTokens: 80,
          });
          if (cancelled || !r.text) return;
          setAiText(r.text.split('\n')[0].slice(0, 80));
          setVisible(true);
          clearTimeout(hide);
          hide = setTimeout(() => setVisible(false), 4500);
        } catch {
          // ひとことは失敗してもテンプレートのままでよい
        }
      })();
    }
    return () => {
      cancelled = true;
      clearTimeout(hide);
    };
  }, [last, llm]);

  const persona = getPersona(personaId, custom);
  return (
    <div
      aria-live="polite"
      className={cn(
        'pointer-events-none flex items-center gap-2 transition-all duration-300',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0',
      )}
    >
      <span className="text-2xl" aria-hidden>
        {persona.emoji}
      </span>
      <span className="rounded-2xl rounded-bl-sm bg-white px-3 py-1.5 text-sm shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700">
        {aiText ?? last.reaction}
      </span>
    </div>
  );
}

/**
 * 評価したときの「ひとこと」。
 * まずアプリがテンプレートから選んだ言葉をすぐに出し、設定が「AI が考える」ならモデルの言葉に差し替える。
 */
export function ReactionBubble() {
  const last = useStudy((s) => s.lastRating);
  const mode = useSettings((s) => s.reaction);
  const engineReady = useEngine((s) => s.status === 'ready');
  if (!last || mode === 'off') return null;
  return <Bubble key={last.at} last={last} llm={mode === 'llm' && engineReady} />;
}
