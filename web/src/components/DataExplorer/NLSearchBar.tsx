'use client';

import { useState } from 'react';
import type { FilterState, NLFilterResponse } from './filterTypes';
import { DEFAULT_FILTER } from './filterTypes';

interface NLSearchBarProps {
  onApply: (patch: Partial<FilterState>) => void;
}

function toPatch(raw: NLFilterResponse): Partial<FilterState> {
  const patch: Partial<FilterState> = {};
  if (Array.isArray(raw.deviceIds)) patch.deviceIds = raw.deviceIds.map(String);
  if (raw.rangePreset) patch.rangePreset = raw.rangePreset;
  if (raw.rangePreset === 'custom') {
    if (raw.customStart) patch.customStart = new Date(raw.customStart).toISOString().slice(0, 16);
    if (raw.customEnd) patch.customEnd = new Date(raw.customEnd).toISOString().slice(0, 16);
  }
  patch.minTempF = raw.minTempF != null ? String(raw.minTempF) : '';
  patch.maxTempF = raw.maxTempF != null ? String(raw.maxTempF) : '';
  patch.minHumidity = raw.minHumidity != null ? String(raw.minHumidity) : '';
  patch.maxHumidity = raw.maxHumidity != null ? String(raw.maxHumidity) : '';
  if (raw.source) patch.source = raw.source;
  if (typeof raw.anomaliesOnly === 'boolean') patch.anomaliesOnly = raw.anomaliesOnly;
  return patch;
}

export function NLSearchBar({ onApply }: NLSearchBarProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/nl-filter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
      });
      if (res.status === 501) {
        setError('Natural-language search isn\'t configured on this deployment.');
        return;
      }
      if (!res.ok) {
        setError('Couldn\'t interpret that query. Try rephrasing.');
        return;
      }
      const body = await res.json();
      const parsed = (body?.filter ?? {}) as NLFilterResponse;
      const patch = toPatch(parsed);
      onApply({ ...DEFAULT_FILTER, ...patch });
    } catch {
      setError('Network error. Filters still work manually.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="flex items-center gap-3 border-b border-[var(--hairline-strong)] focus-within:border-[var(--fg)] transition-colors py-2">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--fg-muted)] shrink-0">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search in plain english"
          className="flex-1 bg-transparent text-base text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:outline-none py-2"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="text-sm font-medium text-[var(--fg-dim)] hover:text-[var(--fg)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors px-2"
        >
          {isLoading ? 'Thinking…' : 'Search'}
        </button>
      </div>
      {error && (
        <p className="text-xs text-[var(--warning)] mt-2">{error}</p>
      )}
    </form>
  );
}
