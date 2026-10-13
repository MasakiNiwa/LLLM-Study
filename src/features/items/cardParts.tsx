/**
 * カードの表示で共通に使う部品（問題文・解説・補足・ヒント）。
 */
import { useState, type ReactNode } from 'react';
import { Lightbulb } from 'lucide-react';
import { CODE_BLOCK } from './cardStyles';

export function Label({ children }: { children: ReactNode }) {
  return (
    <div className="mb-1 text-[0.7rem] font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
      {children}
    </div>
  );
}

export function Notes({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm leading-relaxed text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      {text}
    </p>
  );
}

export function Explanation({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <div>
      <Label>解説</Label>
      <p className="leading-relaxed">{text}</p>
    </div>
  );
}

export /**
 * 問題文。短い 1 行なら中央に大きく（長いものは左寄せ）。改行を含む（条件の箇条書き・コードつきの問題など）なら左寄せにし、
 * 空行のあとの部分はコードとして等幅・字下げを保って表示する。
 */
function Prompt({ children }: { children: string }) {
  if (!children.includes('\n')) {
    // 長い問題文（設例など）は左寄せで少し小さく、読みやすくする
    return children.length > 50 ? (
      <p className="text-lg leading-relaxed font-semibold sm:text-xl">{children}</p>
    ) : (
      <div className="text-center text-xl leading-relaxed font-semibold sm:text-2xl">
        {children}
      </div>
    );
  }
  const [lead, ...blocks] = children.split(/\n[ \t]*\n/);
  return (
    <div className="space-y-3">
      <p className="text-lg leading-relaxed font-semibold whitespace-pre-line sm:text-xl">{lead}</p>
      {blocks.map((b, i) => (
        <pre key={i} className={CODE_BLOCK}>
          <code>{b}</code>
        </pre>
      ))}
    </div>
  );
}

export function Hints({ hints }: { hints?: string[] }) {
  const [shown, setShown] = useState(0);
  if (!hints?.length) return null;
  return (
    <div className="flex flex-col items-center gap-2">
      {hints.slice(0, shown).map((h, i) => (
        <p key={i} className="text-sm text-amber-700 dark:text-amber-300">
          ヒント: {h}
        </p>
      ))}
      {shown < hints.length && (
        <button
          type="button"
          onClick={() => setShown((n) => n + 1)}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40"
        >
          <Lightbulb className="size-4" />
          ヒントを見る
        </button>
      )}
    </div>
  );
}
