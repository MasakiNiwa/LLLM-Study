import type { ReactNode } from 'react';

/** 別のタブで開く外部のリンク（キーの入手先など） */
export function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent-700 underline dark:text-accent-300"
    >
      {children}
    </a>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-white px-1 dark:bg-slate-900">{children}</code>;
}
