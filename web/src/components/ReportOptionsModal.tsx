'use client';

import { useEffect, useState } from 'react';
import { Modal } from './Modal';

export interface ReportQuestionPayload {
  context_id: string;
  prefills: {
    title: string;
    author: string;
    institution: string;
    include_gaps_note: boolean;
    split_by_device: boolean;
    include_weather_section: boolean;
  };
  summary: {
    date_range: string;
    days: number;
    device_count: number;
    reading_count: number;
    has_weather: boolean;
    gap_count: number;
  };
}

export interface ReportGenerated {
  report_id: string;
  filename: string;
  byte_size: number;
}

interface Props {
  payload: ReportQuestionPayload | null;
  onClose: () => void;
  onGenerated: (res: ReportGenerated) => void;
}

const INPUT_CLASS =
  'w-full px-4 py-3 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:outline-none focus:border-[var(--input-focus-border)] transition-colors';

export function ReportOptionsModal({ payload, onClose, onGenerated }: Props) {
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [institution, setInstitution] = useState('');
  const [includeGapsNote, setIncludeGapsNote] = useState(true);
  const [splitByDevice, setSplitByDevice] = useState(false);
  const [includeWeatherSection, setIncludeWeatherSection] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!payload) return;
    setTitle(payload.prefills.title);
    setAuthor(payload.prefills.author);
    setInstitution(payload.prefills.institution);
    setIncludeGapsNote(payload.prefills.include_gaps_note);
    setSplitByDevice(payload.prefills.split_by_device);
    setIncludeWeatherSection(payload.prefills.include_weather_section);
    setSubmitting(false);
    setError(null);
  }, [payload]);

  const isOpen = payload !== null;
  const canSubmit = !submitting && title.trim() && author.trim();

  async function handleGenerate() {
    if (!payload) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/reports/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context_id: payload.context_id,
          answers: {
            title: title.trim(),
            author: author.trim(),
            institution: institution.trim(),
            include_gaps_note: includeGapsNote,
            split_by_device: splitByDevice,
            include_weather_section: includeWeatherSection,
          },
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Generation failed.' }));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = (await res.json()) as ReportGenerated;
      onGenerated(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} enableEscape maxWidth="lg">
      <div className="p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Report Options</h2>
          <button
            onClick={onClose}
            className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {payload && (
          <div className="mb-5 p-4 rounded-xl bg-[var(--hover-bg)] text-sm space-y-1">
            <div className="text-[var(--foreground-muted)]">
              <span className="font-semibold text-[var(--foreground)]">Window:</span> {payload.summary.date_range} ({payload.summary.days} day{payload.summary.days === 1 ? '' : 's'})
            </div>
            <div className="text-[var(--foreground-muted)]">
              <span className="font-semibold text-[var(--foreground)]">Data:</span> {payload.summary.reading_count.toLocaleString()} readings across {payload.summary.device_count} device{payload.summary.device_count === 1 ? '' : 's'}
            </div>
            {payload.summary.gap_count > 0 && (
              <div className="text-[var(--warning)]">
                {payload.summary.gap_count} gap{payload.summary.gap_count === 1 ? '' : 's'} (&gt;3h) detected in sensor coverage
              </div>
            )}
            {!payload.summary.has_weather && (
              <div className="text-[var(--foreground-muted)]">No weather reference data in this window — accuracy section will be skipped.</div>
            )}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-[var(--foreground-muted)] mb-2">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--foreground-muted)] mb-2">Author</label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label className="block text-sm text-[var(--foreground-muted)] mb-2">Institution / Course</label>
            <input
              type="text"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="space-y-2 pt-2">
            <label className="flex items-center gap-3 cursor-pointer text-sm text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={includeGapsNote}
                onChange={(e) => setIncludeGapsNote(e.target.checked)}
                disabled={payload?.summary.gap_count === 0}
                className="w-4 h-4 rounded accent-[var(--brand)]"
              />
              <span className={payload?.summary.gap_count === 0 ? 'opacity-40' : ''}>
                Annotate detected data gaps in Data Collection
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer text-sm text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={splitByDevice}
                onChange={(e) => setSplitByDevice(e.target.checked)}
                disabled={(payload?.summary.device_count ?? 0) <= 1}
                className="w-4 h-4 rounded accent-[var(--brand)]"
              />
              <span className={(payload?.summary.device_count ?? 0) <= 1 ? 'opacity-40' : ''}>
                Split charts by device (per-series overlay)
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer text-sm text-[var(--foreground)]">
              <input
                type="checkbox"
                checked={includeWeatherSection}
                onChange={(e) => setIncludeWeatherSection(e.target.checked)}
                disabled={!payload?.summary.has_weather}
                className="w-4 h-4 rounded accent-[var(--brand)]"
              />
              <span className={!payload?.summary.has_weather ? 'opacity-40' : ''}>
                Include sensor accuracy section (vs reference weather)
              </span>
            </label>
          </div>
        </div>

        {error && (
          <div className="mt-5 alert-accent text-[var(--error)]">
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="flex gap-3 mt-6">
          <button
            onClick={handleGenerate}
            disabled={!canSubmit}
            className="btn-glass px-5 py-2.5 text-sm font-semibold text-[var(--success)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Generating…' : 'Generate'}
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-5 py-2.5 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
