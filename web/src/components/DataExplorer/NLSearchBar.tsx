'use client';

import { useState } from 'react';
import type { FilterState } from './filterTypes';
import { DEFAULT_FILTER } from './filterTypes';

interface NLSearchBarProps {
  onApply: (patch: Partial<FilterState>) => void;
}

interface ParsedFilter {
  deviceIds?: string[];
  rangePreset?: FilterState['rangePreset'];
  customStart?: string;
  customEnd?: string;
  minTempF?: number | null;
  maxTempF?: number | null;
  minHumidity?: number | null;
  maxHumidity?: number | null;
  source?: FilterState['source'];
  anomaliesOnly?: boolean;
}

function toPatch(raw: ParsedFilter): Partial<FilterState> {
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
      const parsed = (body?.filter ?? {}) as ParsedFilter;
      const patch = toPatch(parsed);
      onApply({ ...DEFAULT_FILTER, ...patch });
    } catch {
      setError('Network error. Filters still work manually.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-card p-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
      <div className="flex items-center gap-2 flex-1">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--foreground-muted)] shrink-0 ml-1">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Ask in plain English — e.g. "hot readings on node2 yesterday"'
          className="flex-1 bg-transparent text-sm text-[var(--foreground)] placeholder:text-[var(--foreground-muted)] focus:outline-none px-2 py-1.5"
          disabled={isLoading}
        />
      </div>
      <div className="flex items-center gap-2">
        {error && <span className="text-xs text-[var(--warning)]">{error}</span>}
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="btn-glass px-4 py-1.5 text-xs font-semibold disabled:opacity-50"
        >
          {isLoading ? 'Thinking…' : 'Apply'}
        </button>
      </div>
    </form>
  );
}
