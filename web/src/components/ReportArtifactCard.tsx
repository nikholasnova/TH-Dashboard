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
  const [opening, setOpening] = useState(false);

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

  async function fetchTex(): Promise<string | null> {
    const res = await fetch(`/api/reports/${reportId}/tex`);
    if (!res.ok) {
      setExpired(true);
      return null;
    }
    return res.text();
  }

  async function handleDownloadTex() {
    setDownloading(true);
    try {
      const tex = await fetchTex();
      if (tex === null) return;
      const blob = new Blob([tex], { type: 'text/x-latex;charset=utf-8' });
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

  async function handleOpenOverleaf() {
    setOpening(true);
    try {
      const tex = await fetchTex();
      if (tex === null) return;

      // POST raw tex inline via the 'snip' field. Avoids needing a
      // publicly reachable 'snip_uri' (Overleaf's servers cannot fetch
      // from localhost during development).
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = 'https://www.overleaf.com/docs';
      form.target = '_blank';
      form.rel = 'noopener';
      form.style.display = 'none';

      const snip = document.createElement('input');
      snip.type = 'hidden';
      snip.name = 'snip';
      snip.value = tex;
      form.appendChild(snip);

      const engine = document.createElement('input');
      engine.type = 'hidden';
      engine.name = 'engine';
      engine.value = 'pdflatex';
      form.appendChild(engine);

      if (meta?.filename) {
        const mainDoc = document.createElement('input');
        mainDoc.type = 'hidden';
        mainDoc.name = 'snip_name';
        mainDoc.value = meta.filename;
        form.appendChild(mainDoc);
      }

      document.body.appendChild(form);
      form.submit();
      document.body.removeChild(form);
    } finally {
      setOpening(false);
    }
  }

  if (expired) {
    return (
      <div className="mt-3 p-4 rounded-xl border border-[var(--input-border)] bg-[var(--hover-bg)] text-sm text-[var(--foreground-muted)]">
        Report expired. Ask the assistant to generate a new one.
      </div>
    );
  }

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
          disabled={downloading || opening}
          className="btn-glass px-4 py-2 text-xs font-semibold text-[var(--foreground)] disabled:opacity-50"
        >
          {downloading ? 'Downloading…' : 'Download .tex'}
        </button>
        <button
          onClick={handleOpenOverleaf}
          disabled={downloading || opening}
          className="btn-glass px-4 py-2 text-xs font-semibold text-[var(--success)] disabled:opacity-50"
        >
          {opening ? 'Opening…' : 'Open in Overleaf'}
        </button>
      </div>

      <div className="mt-3 text-[11px] text-[var(--foreground-muted)]">
        Overleaf requires a free account. The report expires in 30 minutes.
      </div>
    </div>
  );
}
