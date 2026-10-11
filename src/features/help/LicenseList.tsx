import { useEffect, useState } from 'react';
import { ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { errorMessage } from '@/lib/utils/format';
import { fetchLicenses, type PackageLicense } from './licenses';

function LicenseRow({ pkg }: { pkg: PackageLicense }) {
  const [open, setOpen] = useState(false);
  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-slate-50 sm:px-5 dark:hover:bg-slate-800/50"
      >
        <ChevronRight
          className={cn('size-4 shrink-0 text-slate-400 transition-transform', open && 'rotate-90')}
        />
        <span className={cn('min-w-0 flex-1 truncate', pkg.direct && 'font-semibold')}>
          {pkg.name}
          <span className="ml-1.5 font-normal text-slate-400">{pkg.version}</span>
        </span>
        <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          {pkg.license}
        </span>
      </button>
      {open && (
        <div className="space-y-2 px-4 pb-3 sm:px-5">
          {pkg.repository && (
            <a
              href={pkg.repository}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs break-all text-accent-700 hover:underline dark:text-accent-300"
            >
              {pkg.repository}
              <ExternalLink className="size-3 shrink-0" />
            </a>
          )}
          {pkg.texts.length === 0 && (
            <p className="text-xs text-slate-500">ライセンス文はパッケージに同梱されていません。</p>
          )}
          {pkg.texts.map((t) => (
            <div key={t.file}>
              <div className="mb-1 text-xs text-slate-500">{t.file}</div>
              <pre className="max-h-64 overflow-auto rounded-lg bg-slate-100 p-3 text-[0.7rem] leading-relaxed whitespace-pre-wrap text-slate-700 dark:bg-slate-950 dark:text-slate-300">
                {t.text}
              </pre>
            </div>
          ))}
        </div>
      )}
    </li>
  );
}

/** 利用しているオープンソースソフトウェアの一覧（ライセンス全文付き） */
export function LicenseList() {
  const [packages, setPackages] = useState<PackageLicense[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchLicenses().then(setPackages, (e: unknown) => setError(errorMessage(e)));
  }, []);

  if (error) {
    return (
      <p className="px-4 py-3 text-sm text-rose-600 sm:px-5">一覧を読み込めませんでした: {error}</p>
    );
  }
  if (!packages) {
    return <p className="px-4 py-3 text-sm text-slate-500 sm:px-5">読み込み中…</p>;
  }
  return (
    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
      {packages.map((p) => (
        <LicenseRow key={`${p.name}@${p.version}`} pkg={p} />
      ))}
    </ul>
  );
}
