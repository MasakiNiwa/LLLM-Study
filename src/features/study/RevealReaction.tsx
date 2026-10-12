import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import {
  parseReactionLines,
  pickReactionLineCount,
  revealReactionPrompt,
} from '@/features/ai/assist';
import { isAiBusy, useAiBusy } from '@/features/ai/aiBusy';
import { cancelAi, runOneshot } from '@/features/ai/oneshot';
import { getPersona, revealText } from '@/features/ai/personas';
import { cardForLlm } from '@/features/ai/studyContext';
import { useEngine } from '@/features/engine/engineStore';
import { useSettings } from '@/features/settings/settingsStore';
import { revealOutcome, useStudy } from './studyStore';

/** 1 枚のカードの答えを見たときのひとこと（カードが変わったら作り直す・生成中なら止める） */
function Bubbles({ llm }: { llm: boolean }) {
  const personaId = useSettings((s) => s.persona);
  const custom = useSettings((s) => s.customPersona);
  const persona = getPersona(personaId, custom);
  // 答えを見た時点の結果で決める（あとから評価のおすすめが変わっても、ひとことは変えない）
  const [start] = useState(() => {
    const st = useStudy.getState();
    const outcome = revealOutcome(st);
    return {
      outcome,
      stats: { done: st.stats.done, correctStreak: st.stats.correctStreak },
      template: revealText(persona, outcome, st.stats.correctStreak),
    };
  });
  // null: AI が考え中
  const [lines, setLines] = useState<string[] | null>(llm ? null : [start.template]);

  useEffect(() => {
    if (!llm) return;
    let alive = true;
    void (async () => {
      const st = useStudy.getState();
      const written = st.answer?.shownAt === st.shownAt ? st.answer : null;
      const json = st.current
        ? await cardForLlm(st.current.card, { revealed: true, userAnswer: written })
        : null;
      if (!alive) return;
      // ほかの生成（解説など）の最中なら、待たせずテンプレートにする
      if (isAiBusy()) {
        setLines([start.template]);
        return;
      }
      // 吹き出しの数はアプリが決める（たいていは 1 つ、ときどき 2〜3 つ）
      const count = pickReactionLineCount(Math.random());
      try {
        const r = await runOneshot({
          task: 'reaction',
          prompt: revealReactionPrompt(start.outcome, count, json, start.stats),
          maxOutputTokens: 90 * count,
          onText: (text) => {
            if (alive) setLines(parseReactionLines(text, count));
          },
        });
        if (!alive) return;
        const final = parseReactionLines(r.text, count);
        setLines(r.cancelled || final.length === 0 ? [start.template] : final);
      } catch {
        // ひとことは失敗してもテンプレートでよい
        if (alive) setLines([start.template]);
      }
    })();
    return () => {
      alive = false;
      // 次のカードに進んだら、間に合わなかったひとことは出さずに止める
      if (useAiBusy.getState().task === 'reaction') cancelAi();
    };
  }, [llm, start]);

  return (
    <div className="flex animate-fade-in gap-2.5" aria-live="polite">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-xl shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
        aria-hidden
      >
        {persona.emoji}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        {(lines ?? []).map((line, i) => (
          <p
            key={i}
            className="w-fit max-w-full animate-fade-in rounded-2xl rounded-tl-sm bg-white px-3.5 py-2 text-sm leading-relaxed shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
          >
            {line}
          </p>
        ))}
        {lines === null && (
          <p
            className={cn(
              'w-fit rounded-2xl rounded-tl-sm bg-white px-3.5 py-2 text-sm text-slate-400 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700',
              'animate-pulse',
            )}
            aria-label={`${persona.name}が考えています`}
          >
            …
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * 答えを見て解説を読んでいるあいだに出す「ひとこと」。
 * 設定が「AI が考える」でモデルがあれば AI が性格を出して話しかけ（ときどき 2〜3 回）、
 * なければアプリがテンプレートから選ぶ。間に合わずに次のカードへ進んだら、あえて出さない。
 */
export function RevealReaction() {
  const mode = useSettings((s) => s.reaction);
  const engineReady = useEngine((s) => s.status === 'ready');
  const revealed = useStudy((s) => s.revealed);
  const cardId = useStudy((s) => s.current?.card.id);
  const shownAt = useStudy((s) => s.shownAt);
  if (!revealed || !cardId || mode === 'off') return null;
  return <Bubbles key={`${cardId}:${shownAt}`} llm={mode === 'llm' && engineReady} />;
}
