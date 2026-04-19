'use client';

import { useState } from 'react';
import type { DeploymentWithCount, Device } from '@/lib/supabase';
import type { FilterState, RangePreset, SourceFilter } from './filterTypes';
import { DEFAULT_FILTER } from './filterTypes';
import { resolveDeviceColor } from '@/lib/deviceColors';
import { SegmentedNav } from '../SegmentedNav';
import { InlineSelect } from '../DeviceDeploymentFilter';

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
  'h-11 bg-transparent border-0 border-b border-[var(--hairline)] pl-0 pr-1 text-sm tracking-tight text-[var(--fg)] focus:outline-none focus:border-[var(--fg)] transition-colors [color-scheme:dark]';

const numberInputClass = `${inputClass} w-16`;

function countActiveFilters(state: FilterState): number {
  let n = 0;
  if (state.deviceIds.length > 0) n++;
  if (state.rangePreset !== DEFAULT_FILTER.rangePreset) n++;
  if (state.source !== DEFAULT_FILTER.source) n++;
  if (state.minTempF !== '' || state.maxTempF !== '') n++;
  if (state.minHumidity !== '' || state.maxHumidity !== '') n++;
  if (state.deploymentId != null) n++;
  if (state.anomaliesOnly) n++;
  return n;
}

export function FilterBar({ state, onChange, devices, deployments, anomalyCount, resultCount, onReset }: FilterBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const activeCount = countActiveFilters(state);

  const toggleDevice = (id: string) => {
    const next = state.deviceIds.includes(id)
      ? state.deviceIds.filter((d) => d !== id)
      : [...state.deviceIds, id];
    onChange({ ...state, deviceIds: next });
  };

  return (
    <div className="border-y border-[var(--hairline)]">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsOpen((v) => !v)}
          className="flex-1 flex items-center gap-3 py-3 text-left px-1"
          aria-expanded={isOpen}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`text-[var(--fg-muted)] transition-transform ${isOpen ? 'rotate-90' : ''}`}>
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className="text-sm font-medium text-[var(--fg)]">Filters</span>
          {activeCount > 0 && (
            <span className="text-xs text-[var(--fg-dim)] metric">{activeCount} active</span>
          )}
        </button>
        <div className="flex items-center gap-4 text-xs text-[var(--fg-muted)] pr-1">
          <span className="metric">{resultCount.toLocaleString()} readings</span>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onReset}
              className="text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors underline-offset-2 hover:underline"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="space-y-4 pb-4 pt-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider mr-1">Devices</span>
            {devices.length === 0 ? (
              <span className="text-xs text-[var(--fg-muted)]">No devices registered</span>
            ) : (
              devices.map((d) => {
                const active = state.deviceIds.length === 0 || state.deviceIds.includes(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDevice(d.id)}
                    className={`text-xs px-3 py-1.5 rounded-full transition-colors flex items-center gap-2 ${
                      active
                        ? 'bg-[var(--active-bg)] text-[var(--fg)]'
                        : 'text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--hover-bg)]'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full" style={{ background: resolveDeviceColor(d) }} />
                    {d.display_name}
                  </button>
                );
              })
            )}
            {state.deviceIds.length > 0 && (
              <button
                type="button"
                onClick={() => onChange({ ...state, deviceIds: [] })}
                className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] ml-1"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-start gap-6">
            <div>
              <p className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-2">Range</p>
              <SegmentedNav
                layoutGroupId="data-range"
                value={state.rangePreset}
                onChange={(v) => onChange({ ...state, rangePreset: v as RangePreset })}
                options={RANGE_OPTIONS}
              />
            </div>

            <div>
              <p className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider mb-2">Source</p>
              <SegmentedNav
                layoutGroupId="data-source"
                value={state.source}
                onChange={(v) => onChange({ ...state, source: v as SourceFilter })}
                options={SOURCE_OPTIONS}
              />
            </div>

            {state.rangePreset === 'custom' && (
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={state.customStart}
                  onChange={(e) => onChange({ ...state, customStart: e.target.value })}
                  className={inputClass}
                />
                <span className="text-xs text-[var(--fg-muted)]">to</span>
                <input
                  type="datetime-local"
                  value={state.customEnd}
                  onChange={(e) => onChange({ ...state, customEnd: e.target.value })}
                  className={inputClass}
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider">Temp °F</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="min"
                value={state.minTempF}
                onChange={(e) => onChange({ ...state, minTempF: e.target.value })}
                className={numberInputClass}
              />
              <span className="text-xs text-[var(--fg-muted)]">to</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="max"
                value={state.maxTempF}
                onChange={(e) => onChange({ ...state, maxTempF: e.target.value })}
                className={numberInputClass}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider">Humidity %</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="min"
                value={state.minHumidity}
                onChange={(e) => onChange({ ...state, minHumidity: e.target.value })}
                className={numberInputClass}
              />
              <span className="text-xs text-[var(--fg-muted)]">to</span>
              <input
                type="number"
                inputMode="decimal"
                placeholder="max"
                value={state.maxHumidity}
                onChange={(e) => onChange({ ...state, maxHumidity: e.target.value })}
                className={numberInputClass}
              />
            </div>

            {deployments.length > 0 && (
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-[var(--fg-muted)] uppercase tracking-wider">Deployment</span>
                <InlineSelect
                  value={state.deploymentId != null ? String(state.deploymentId) : ''}
                  onChange={(v) =>
                    onChange({ ...state, deploymentId: v ? Number(v) : null })
                  }
                  placeholder="Any"
                  className="w-40"
                >
                  {deployments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </InlineSelect>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
            <input
              type="checkbox"
              checked={state.anomaliesOnly}
              onChange={(e) => onChange({ ...state, anomaliesOnly: e.target.checked })}
              className="w-4 h-4 rounded accent-[var(--error)]"
            />
            <span className="text-[var(--fg-dim)]">
              Anomalies only {anomalyCount > 0 && (
                <span className="ml-1 text-xs text-[var(--error)] font-medium">({anomalyCount})</span>
              )}
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
