'use client';

import type { DeploymentWithCount, Device } from '@/lib/supabase';
import type { FilterState, RangePreset, SourceFilter } from './filterTypes';

interface FilterBarProps {
  state: FilterState;
  onChange: (next: FilterState) => void;
  devices: Device[];
  deployments: DeploymentWithCount[];
  anomalyCount: number;
  resultCount: number;
  onReset: () => void;
}

const RANGE_OPTIONS: { value: RangePreset; label: string }[] = [
  { value: '1h', label: '1h' },
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All' },
  { value: 'custom', label: 'Custom' },
];

const SOURCE_OPTIONS: { value: SourceFilter; label: string }[] = [
  { value: 'sensor', label: 'Sensor' },
  { value: 'weather', label: 'Weather' },
  { value: 'both', label: 'Both' },
];

const inputClass =
  'bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)]';

export function FilterBar({ state, onChange, devices, deployments, anomalyCount, resultCount, onReset }: FilterBarProps) {
  const toggleDevice = (id: string) => {
    const next = state.deviceIds.includes(id)
      ? state.deviceIds.filter((d) => d !== id)
      : [...state.deviceIds, id];
    onChange({ ...state, deviceIds: next });
  };

  return (
    <div className="glass-card p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wider mr-1">Devices</span>
        {devices.length === 0 ? (
          <span className="text-xs text-[var(--foreground-muted)]">No devices registered</span>
        ) : (
          devices.map((d) => {
            const active = state.deviceIds.length === 0 || state.deviceIds.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => toggleDevice(d.id)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-2 ${
                  active
                    ? 'border-[var(--btn-border-hover)] bg-[var(--active-bg)] text-[var(--foreground)]'
                    : 'border-[var(--input-border)] text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                {d.display_name}
              </button>
            );
          })
        )}
        {state.deviceIds.length > 0 && (
          <button
            type="button"
            onClick={() => onChange({ ...state, deviceIds: [] })}
            className="text-xs text-[var(--foreground-muted)] hover:text-[var(--foreground)] ml-1"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wider mr-1">Range</span>
          <div className="flex rounded-lg overflow-hidden border border-[var(--input-border)]">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ ...state, rangePreset: opt.value })}
                className={`text-xs px-3 py-1.5 transition-colors ${
                  state.rangePreset === opt.value
                    ? 'bg-[var(--active-bg)] text-[var(--foreground)]'
                    : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {state.rangePreset === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={state.customStart}
              onChange={(e) => onChange({ ...state, customStart: e.target.value })}
              className={inputClass}
            />
            <span className="text-xs text-[var(--foreground-muted)]">to</span>
            <input
              type="datetime-local"
              value={state.customEnd}
              onChange={(e) => onChange({ ...state, customEnd: e.target.value })}
              className={inputClass}
            />
          </div>
        )}

        <div className="flex items-center gap-1">
          <span className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wider mr-1">Source</span>
          <div className="flex rounded-lg overflow-hidden border border-[var(--input-border)]">
            {SOURCE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onChange({ ...state, source: opt.value })}
                className={`text-xs px-3 py-1.5 transition-colors ${
                  state.source === opt.value
                    ? 'bg-[var(--active-bg)] text-[var(--foreground)]'
                    : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wider">Temp °F</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="min"
            value={state.minTempF}
            onChange={(e) => onChange({ ...state, minTempF: e.target.value })}
            className={`${inputClass} w-20`}
          />
          <span className="text-xs text-[var(--foreground-muted)]">to</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="max"
            value={state.maxTempF}
            onChange={(e) => onChange({ ...state, maxTempF: e.target.value })}
            className={`${inputClass} w-20`}
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wider">Humidity %</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="min"
            value={state.minHumidity}
            onChange={(e) => onChange({ ...state, minHumidity: e.target.value })}
            className={`${inputClass} w-20`}
          />
          <span className="text-xs text-[var(--foreground-muted)]">to</span>
          <input
            type="number"
            inputMode="decimal"
            placeholder="max"
            value={state.maxHumidity}
            onChange={(e) => onChange({ ...state, maxHumidity: e.target.value })}
            className={`${inputClass} w-20`}
          />
        </div>

        {deployments.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wider">Deployment</span>
            <select
              value={state.deploymentId ?? ''}
              onChange={(e) =>
                onChange({ ...state, deploymentId: e.target.value ? Number(e.target.value) : null })
              }
              className={inputClass}
            >
              <option value="">Any</option>
              {deployments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--divider)]">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={state.anomaliesOnly}
            onChange={(e) => onChange({ ...state, anomaliesOnly: e.target.checked })}
            className="w-4 h-4 rounded accent-[var(--error)]"
          />
          <span className="text-[var(--foreground-secondary)]">
            Anomalies only {anomalyCount > 0 && (
              <span className="ml-1 text-xs text-[var(--error)] font-medium">({anomalyCount})</span>
            )}
          </span>
        </label>

        <div className="flex items-center gap-3 text-xs text-[var(--foreground-muted)]">
          <span>{resultCount.toLocaleString()} readings shown</span>
          <button
            type="button"
            onClick={onReset}
            className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors underline-offset-2 hover:underline"
          >
            Reset filters
          </button>
        </div>
      </div>
    </div>
  );
}
