'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageLayout } from '@/components/PageLayout';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { useDevices } from '@/contexts/DevicesContext';
import { useSession } from '@/components/AuthProvider';
import { useGuest } from '@/contexts/GuestContext';
import {
  celsiusToFahrenheit,
  deleteReadingById,
  getDeployments,
  getFilteredReadings,
  type DeploymentWithCount,
  type Reading,
} from '@/lib/supabase';
import { flagAnomalies } from '@/lib/anomalies';
import { FilterBar } from '@/components/DataExplorer/FilterBar';
import { NLSearchBar } from '@/components/DataExplorer/NLSearchBar';
import { ReadingsTable } from '@/components/DataExplorer/ReadingsTable';
import {
  DEFAULT_FILTER,
  fahrenheitToCelsius,
  parseNumberInput,
  resolveRange,
  type FilterState,
} from '@/components/DataExplorer/filterTypes';

function csvSafe(value: string): string {
  if (/[,"\n\r]/.test(value) || /^[=+\-@\t\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCsv(readings: Reading[]) {
  const header = ['id', 'device_id', 'source', 'timestamp_utc', 'temperature_c', 'temperature_f', 'humidity_pct', 'deployment_id'];
  const rows = readings.map((r) => [
    String(r.id),
    r.device_id,
    r.source ?? 'sensor',
    r.created_at,
    r.temperature.toFixed(2),
    celsiusToFahrenheit(r.temperature).toFixed(2),
    r.humidity.toFixed(2),
    r.deployment_id != null ? String(r.deployment_id) : '',
  ].map(csvSafe).join(','));
  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `readings-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataPage() {
  const { devices } = useDevices();
  const { role } = useSession();
  const { isGuest } = useGuest();
  const canDelete = !isGuest && role === 'admin';

  const [filter, setFilter] = useState<FilterState>(DEFAULT_FILTER);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [deployments, setDeployments] = useState<DeploymentWithCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [ceiling, setCeiling] = useState(0);

  useEffect(() => {
    getDeployments().then(setDeployments).catch(() => {});
  }, []);

  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    if (devices.length === 0) return;
    seededRef.current = true;
    setFilter((prev) => (prev.deviceIds.length === 0 ? { ...prev, deviceIds: [devices[0].id] } : prev));
  }, [devices]);

  const fetchReadings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const { start, end } = resolveRange(filter);
      const minTempF = parseNumberInput(filter.minTempF);
      const maxTempF = parseNumberInput(filter.maxTempF);
      const minHum = parseNumberInput(filter.minHumidity);
      const maxHum = parseNumberInput(filter.maxHumidity);

      let deviceIdsForQuery: string[] | undefined;
      if (filter.deviceIds.length > 0) {
        if (filter.source === 'weather') {
          deviceIdsForQuery = filter.deviceIds.map((id) => `weather_${id}`);
        } else if (filter.source === 'sensor') {
          deviceIdsForQuery = filter.deviceIds;
        } else {
          deviceIdsForQuery = filter.deviceIds.flatMap((id) => [id, `weather_${id}`]);
        }
      }

      const result = await getFilteredReadings({
        start,
        end,
        deviceIds: deviceIdsForQuery,
        source: filter.source,
        minTempC: minTempF != null ? fahrenheitToCelsius(minTempF) : undefined,
        maxTempC: maxTempF != null ? fahrenheitToCelsius(maxTempF) : undefined,
        minHumidity: minHum ?? undefined,
        maxHumidity: maxHum ?? undefined,
        deploymentId: filter.deploymentId ?? undefined,
        sort: 'desc',
      });
      setReadings(result.readings);
      setTruncated(result.truncated);
      setCeiling(result.ceiling);
    } catch (e) {
      console.error(e);
      setError('Failed to load readings.');
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    const timer = setTimeout(() => void fetchReadings(), 150);
    return () => clearTimeout(timer);
  }, [fetchReadings]);

  const flags = useMemo(() => flagAnomalies(readings), [readings]);

  const visibleReadings = useMemo(() => {
    if (!filter.anomaliesOnly) return readings;
    return readings.filter((r) => flags.has(r.id));
  }, [readings, flags, filter.anomaliesOnly]);

  const handleDelete = async (id: number) => {
    setIsDeleting(true);
    try {
      await deleteReadingById(id);
      setReadings((prev) => prev.filter((r) => r.id !== id));
    } catch {
      setError('Delete failed. Only admins can remove readings.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleBulkDelete = async (ids: number[]) => {
    setIsDeleting(true);
    const deleted = new Set<number>();
    try {
      for (const id of ids) {
        try {
          await deleteReadingById(id);
          deleted.add(id);
        } catch (e) {
          console.error('Bulk delete error for', id, e);
        }
      }
      setReadings((prev) => prev.filter((r) => !deleted.has(r.id)));
      if (deleted.size < ids.length) {
        setError(`Deleted ${deleted.size} of ${ids.length}. Some failed — check console.`);
      }
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <PageLayout title="Data">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h1 className="hidden sm:block text-2xl font-bold text-[var(--foreground)]">Data Explorer</h1>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">
            Browse every reading, spot anomalies, and clean up bad rows.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {flags.size > 0 && (
            <span className="eyebrow text-[var(--error)]">
              {flags.size} anomal{flags.size === 1 ? 'y' : 'ies'} in view
            </span>
          )}
          <button
            type="button"
            onClick={() => downloadCsv(visibleReadings)}
            disabled={visibleReadings.length === 0}
            className="btn-glass px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="mb-3">
        <NLSearchBar onApply={(patch) => setFilter((prev) => ({ ...prev, ...patch }))} />
      </div>

      <div className="mb-5">
        <FilterBar
          state={filter}
          onChange={setFilter}
          devices={devices}
          deployments={deployments}
          anomalyCount={flags.size}
          resultCount={visibleReadings.length}
          onReset={() => setFilter(DEFAULT_FILTER)}
        />
      </div>

      {error && (
        <div className="mb-4 alert-accent text-[var(--error)] text-sm">
          {error}
        </div>
      )}

      {truncated && (
        <div className="mb-4 alert-accent text-[var(--warning)] text-sm">
          Hit the {ceiling.toLocaleString()}-row safety cap. Older readings in this range were not loaded — narrow the time window or device filter to see them.
        </div>
      )}

      {isLoading ? (
        <div className="glass-card p-12">
          <LoadingSpinner message="Loading readings..." />
        </div>
      ) : (
        <ReadingsTable
          readings={visibleReadings}
          contextReadings={readings}
          flags={flags}
          devices={devices}
          canDelete={canDelete}
          isDeleting={isDeleting}
          onDelete={handleDelete}
          onBulkDelete={handleBulkDelete}
        />
      )}
    </PageLayout>
  );
}
