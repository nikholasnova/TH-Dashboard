'use client';

import { Fragment, useMemo, useState } from 'react';
import type { Device, Reading } from '@/lib/supabase';
import { celsiusToFahrenheit } from '@/lib/supabase';
import type { AnomalyFlag } from '@/lib/anomalies';
import { Sparkline } from '../Sparkline';
import { ConfirmDeleteModal } from './ConfirmDeleteModal';

type SortKey = 'created_at' | 'device_id' | 'temperature' | 'humidity' | 'source';
type SortDir = 'asc' | 'desc';

interface ReadingsTableProps {
  readings: Reading[];
  contextReadings?: Reading[];
  flags: Map<number, AnomalyFlag>;
  devices: Device[];
  canDelete: boolean;
  isDeleting: boolean;
  onDelete: (id: number) => Promise<void>;
  onBulkDelete: (ids: number[]) => Promise<void>;
}

function reasonLabel(r: AnomalyFlag['reason']): string {
  switch (r) {
    case 'temp-spike': return 'Temp spike';
    case 'hum-spike': return 'Humidity spike';
  }
}

interface DeviceSeries {
  ids: number[];
  valuesF: number[];
  indexById: Map<number, number>;
}

function buildDeviceSeries(readings: Reading[]): Map<string, DeviceSeries> {
  const perDevice = new Map<string, Reading[]>();
  for (const r of readings) {
    const list = perDevice.get(r.device_id);
    if (list) list.push(r);
    else perDevice.set(r.device_id, [r]);
  }
  const out = new Map<string, DeviceSeries>();
  for (const [deviceId, list] of perDevice) {
    const asc = [...list].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const ids = asc.map((r) => r.id);
    const valuesF = asc.map((r) => celsiusToFahrenheit(r.temperature));
    const indexById = new Map<number, number>();
    asc.forEach((r, i) => indexById.set(r.id, i));
    out.set(deviceId, { ids, valuesF, indexById });
  }
  return out;
}

function neighborValues(series: DeviceSeries | undefined, id: number, span = 15): { values: number[]; highlight: number } {
  if (!series) return { values: [], highlight: -1 };
  const pos = series.indexById.get(id);
  if (pos == null) return { values: [], highlight: -1 };
  const from = Math.max(0, pos - span);
  const to = Math.min(series.valuesF.length, pos + span + 1);
  return {
    values: series.valuesF.slice(from, to),
    highlight: pos - from,
  };
}

const PAGE_SIZE_OPTIONS = [50, 100, 250, 500] as const;
const DEFAULT_PAGE_SIZE = 100;

export function ReadingsTable({ readings, contextReadings, flags, devices, canDelete, isDeleting, onDelete, onBulkDelete }: ReadingsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);

  const deviceMap = useMemo(() => {
    const m: Record<string, Device> = {};
    for (const d of devices) m[d.id] = d;
    return m;
  }, [devices]);

  const deviceSeries = useMemo(
    () => buildDeviceSeries(contextReadings ?? readings),
    [contextReadings, readings],
  );

  const sorted = useMemo(() => {
    const copy = [...readings];
    const dir = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      const av = a[sortKey as keyof Reading];
      const bv = b[sortKey as keyof Reading];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
    return copy;
  }, [readings, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));

  const [readingsSnap, setReadingsSnap] = useState(readings);
  if (readingsSnap !== readings) {
    setReadingsSnap(readings);
    setPage(1);
  }

  const effectivePage = Math.min(page, totalPages);
  const pageRows = useMemo(
    () => sorted.slice((effectivePage - 1) * pageSize, effectivePage * pageSize),
    [sorted, effectivePage, pageSize],
  );

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'created_at' ? 'desc' : 'asc');
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.id));
  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        for (const r of pageRows) next.delete(r.id);
      } else {
        for (const r of pageRows) next.add(r.id);
      }
      return next;
    });
  };

  const handleDelete = async (id: number) => {
    if (confirmingId !== id) {
      setConfirmingId(id);
      setTimeout(() => setConfirmingId((cur) => (cur === id ? null : cur)), 4000);
      return;
    }
    setConfirmingId(null);
    await onDelete(id);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleBulkDeleteRequest = () => {
    if (selected.size === 0) return;
    setIsBulkConfirmOpen(true);
  };

  const handleBulkDeleteConfirm = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      setIsBulkConfirmOpen(false);
      return;
    }
    await onBulkDelete(ids);
    setSelected(new Set());
    setIsBulkConfirmOpen(false);
  };

  const selectedCount = selected.size;

  if (readings.length === 0) {
    return (
      <div className="glass-card p-10 text-center text-[var(--foreground-muted)]">
        <p className="text-sm">No readings match the current filters.</p>
      </div>
    );
  }

  const renderHeader = (k: SortKey, label: string, numeric = false) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors ${numeric ? 'justify-end w-full' : ''}`}
    >
      {label}
      {sortKey === k && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </button>
  );

  return (
    <div className="glass-card overflow-hidden">
      {selectedCount > 0 && canDelete && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--divider)] bg-[var(--hover-bg)]">
          <span className="text-sm text-[var(--foreground)]">{selectedCount} selected</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleBulkDeleteRequest}
              disabled={isDeleting}
              className="btn-glass px-4 py-1.5 text-xs font-semibold text-[var(--error)] disabled:opacity-50"
            >
              {isDeleting ? 'Deleting…' : `Delete ${selectedCount}`}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--divider)]">
              {canDelete && (
                <th className="py-3 pl-4 pr-2 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded accent-[var(--primary)]"
                  />
                </th>
              )}
              <th className="py-3 px-2 text-left">{renderHeader('created_at', 'Time')}</th>
              <th className="py-3 px-2 text-left">{renderHeader('device_id', 'Device')}</th>
              <th className="py-3 px-2 text-right">{renderHeader('temperature', 'Temp', true)}</th>
              <th className="py-3 px-2 text-right">{renderHeader('humidity', 'Humidity', true)}</th>
              <th className="py-3 px-2 text-left">{renderHeader('source', 'Source')}</th>
              <th className="py-3 px-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">Flag</th>
              <th className="py-3 pr-4 pl-2 text-right text-[11px] font-semibold uppercase tracking-wider text-[var(--foreground-muted)]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, i) => {
              const flag = flags.get(r.id);
              const device = deviceMap[r.device_id];
              const isExpanded = expandedId === r.id;
              const isConfirming = confirmingId === r.id;
              const timestamp = new Date(r.created_at);
              const neighbors = isExpanded ? neighborValues(deviceSeries.get(r.device_id), r.id) : null;

              return (
                <Fragment key={r.id}>
                  <tr
                    className={`border-b border-[var(--divider)] last:border-b-0 transition-colors hover:bg-[var(--hover-bg)] ${
                      flag ? 'bg-[var(--error)]/5' : ''
                    } ${i % 2 === 1 ? 'bg-[var(--foreground)]/[0.015]' : ''}`}
                  >
                    {canDelete && (
                      <td className="py-2.5 pl-4 pr-2">
                        <input
                          type="checkbox"
                          checked={selected.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          className="w-4 h-4 rounded accent-[var(--primary)]"
                        />
                      </td>
                    )}
                    <td className="py-2.5 px-2 text-[var(--foreground)] font-mono text-xs whitespace-nowrap">
                      {timestamp.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-2.5 px-2">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ background: device?.color ?? 'var(--foreground-muted)' }}
                        />
                        <span className="text-[var(--foreground)]">{device?.display_name ?? r.device_id}</span>
                      </span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-[var(--foreground)]">
                      {celsiusToFahrenheit(r.temperature).toFixed(1)}°F
                      <span className="text-[var(--foreground-muted)] text-xs ml-1">({r.temperature.toFixed(1)}°C)</span>
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-[var(--foreground)]">
                      {r.humidity.toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-2 text-[var(--foreground-muted)] text-xs">
                      {r.source ?? 'sensor'}
                    </td>
                    <td className="py-2.5 px-2">
                      {flag && (
                        <span
                          className="text-xs font-medium text-[var(--error)]"
                          title={`Δ neighbors: ${flag.tempDeltaF >= 0 ? '+' : ''}${flag.tempDeltaF.toFixed(1)}°F, ${flag.humDelta >= 0 ? '+' : ''}${flag.humDelta.toFixed(1)}%`}
                        >
                          {reasonLabel(flag.reason)}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 pl-2 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : r.id)}
                        className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] px-2 py-1"
                      >
                        {isExpanded ? 'Hide' : 'Context'}
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDelete(r.id)}
                          disabled={isDeleting}
                          className={`text-xs ml-1 px-2 py-1 rounded transition-colors ${
                            isConfirming
                              ? 'bg-[var(--error)]/15 text-[var(--error)] font-semibold'
                              : 'text-[var(--foreground-muted)] hover:text-[var(--error)]'
                          } disabled:opacity-50`}
                        >
                          {isConfirming ? 'Confirm?' : 'Delete'}
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && neighbors && neighbors.values.length >= 2 && (
                    <tr className="border-b border-[var(--divider)] bg-[var(--hover-bg)]/40">
                      <td colSpan={canDelete ? 8 : 7} className="px-4 py-3">
                        <div className="flex items-center gap-4">
                          <div className="text-xs text-[var(--foreground-muted)] whitespace-nowrap">
                            ±{Math.floor(neighbors.values.length / 2)} neighboring readings
                          </div>
                          <div className="flex-1" style={{ height: 48 }}>
                            <Sparkline values={neighbors.values} highlightIndex={neighbors.highlight} height={48} animate={false} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-[var(--divider)] text-xs text-[var(--foreground-muted)]">
        <div className="flex items-center gap-2">
          <span>Rows per page</span>
          <select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value));
              setPage(1);
            }}
            className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-md px-2 py-1 text-xs text-[var(--foreground)]"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <span>
            {sorted.length === 0
              ? '0 rows'
              : `${(effectivePage - 1) * pageSize + 1}–${Math.min(effectivePage * pageSize, sorted.length)} of ${sorted.length.toLocaleString()}`}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(1)}
              disabled={effectivePage === 1}
              className="px-2 py-1 rounded hover:bg-[var(--hover-bg)] disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="First page"
            >
              «
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={effectivePage === 1}
              className="px-2 py-1 rounded hover:bg-[var(--hover-bg)] disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Previous page"
            >
              ‹
            </button>
            <span className="px-2 text-[var(--foreground)]">
              {effectivePage} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={effectivePage >= totalPages}
              className="px-2 py-1 rounded hover:bg-[var(--hover-bg)] disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next page"
            >
              ›
            </button>
            <button
              type="button"
              onClick={() => setPage(totalPages)}
              disabled={effectivePage >= totalPages}
              className="px-2 py-1 rounded hover:bg-[var(--hover-bg)] disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Last page"
            >
              »
            </button>
          </div>
        </div>
      </div>

      <ConfirmDeleteModal
        isOpen={isBulkConfirmOpen}
        count={selectedCount}
        isDeleting={isDeleting}
        onConfirm={handleBulkDeleteConfirm}
        onClose={() => { if (!isDeleting) setIsBulkConfirmOpen(false); }}
      />
    </div>
  );
}
