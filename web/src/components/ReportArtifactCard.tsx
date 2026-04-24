'use client';

import { useEffect, useState } from 'react';

interface Props {
  reportId: string;
}

interface Meta {
  filename: string;
  byte_size: number;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ReportArtifactCard({ reportId }: Props) {
  const [meta, setMeta] = useState<Meta | null>(null);
  const [expired, setExpired] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/reports/${reportId}/meta`);
        if (cancelled) return;
        if (res.status === 404) {
          setExpired(true);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as Meta;
        setMeta(data);
      } catch {
        // leave meta null; UI still shows base state
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  async function handleDownloadTex() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/tex`);
      if (!res.ok) {
        setExpired(true);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = meta?.filename ?? `report-${reportId.slice(0, 8)}.tex`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  if (expired) {
    return (
      <div className="mt-3 p-4 rounded-xl border border-[var(--input-border)] bg-[var(--hover-bg)] text-sm text-[var(--foreground-muted)]">
        Report expired. Ask the assistant to generate a new one.
      </div>
    );
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const overleafSnipUri = origin ? `${origin}/api/reports/${reportId}/tex` : '';

  return (
    <div className="mt-3 p-4 rounded-xl border border-[var(--input-border)] bg-[var(--hover-bg)]">
      <div className="flex items-center gap-3 mb-3">
        <div className="shrink-0 w-10 h-10 rounded-lg bg-[var(--input-bg)] flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-[var(--foreground-muted)]">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[var(--foreground)] truncate">
            {meta?.filename ?? 'Preparing report…'}
          </div>
          <div className="text-xs text-[var(--foreground-muted)]">
            {meta ? `${formatBytes(meta.byte_size)} · LaTeX source` : 'Fetching details…'}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleDownloadTex}
          disabled={downloading}
          className="btn-glass px-4 py-2 text-xs font-semibold text-[var(--foreground)] disabled:opacity-50"
        >
          {downloading ? 'Downloading…' : 'Download .tex'}
        </button>
        {overleafSnipUri && (
          <form method="POST" action="https://www.overleaf.com/docs" target="_blank" rel="noopener">
            <input type="hidden" name="snip_uri" value={overleafSnipUri} />
            <input type="hidden" name="engine" value="pdflatex" />
            <button
              type="submit"
              className="btn-glass px-4 py-2 text-xs font-semibold text-[var(--success)]"
            >
              Open in Overleaf
            </button>
          </form>
        )}
      </div>

      <div className="mt-3 text-[11px] text-[var(--foreground-muted)]">
        Overleaf requires a free account. The report expires in 30 minutes.
      </div>
    </div>
  );
}
