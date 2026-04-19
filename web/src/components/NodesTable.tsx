'use client';

import { Reading, Deployment, ChartSample, Device, celsiusToFahrenheit } from '@/lib/supabase';
import { STALE_THRESHOLD_MS } from '@/lib/constants';
import { getTimeAgo, formatPercent } from '@/lib/format';
import { computePercentError } from '@/lib/weatherCompare';
import { Sparkline } from './Sparkline';
import { StatusDot, type NodeStatus } from './StatusDot';
import { resolveDeviceColor } from '@/lib/deviceColors';

interface DeviceData {
  reading: Reading | null;
  deployment: Deployment | null;
  weather: Reading | null;
  sparkline: ChartSample[];
}

interface NodesTableProps {
  devices: Device[];
  deviceData: Record<string, DeviceData>;
  lastRefresh: Date | null;
  onDeviceClick?: (device: Device) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
}

const WEATHER_STALE_MS = 2 * 60 * 60 * 1000;

function getStatus(reading: Reading | null, referenceMs: number | null): NodeStatus {
  if (!reading) return 'offline';
  const age = (referenceMs ?? Date.now()) - new Date(reading.created_at).getTime();
  if (age > STALE_THRESHOLD_MS) return 'offline';
  return 'live';
}

function deltaColor(pct: number | null | undefined): string {
  if (pct == null) return 'var(--fg-muted)';
  if (pct < 3) return 'var(--success)';
  if (pct < 5) return 'var(--warning)';
  return 'var(--error)';
}

export function NodesTable({ devices, deviceData, lastRefresh, onDeviceClick, onRefresh, isLoading }: NodesTableProps) {
  const referenceMs = lastRefresh?.getTime() ?? null;

  return (
    <div className="border-y border-[var(--hairline)]">
      <div className="hidden sm:grid grid-cols-[auto_minmax(0,1fr)_auto_auto_120px_auto_auto] items-center gap-6 px-4 py-2 text-[11px] uppercase tracking-wider text-[var(--fg-muted)] font-medium">
        <span />
        <span>Node</span>
        <span className="text-right">Temp</span>
        <span className="text-right">Humidity</span>
        <span className="text-center">Trend</span>
        <span className="text-right">vs Weather</span>
        <span className="text-right">Last Reading</span>
      </div>

      <div className="divide-y divide-[var(--hairline)]">
        {devices.map((device) => {
          const data = deviceData[device.id];
          const reading = data?.reading ?? null;
          const deployment = data?.deployment ?? null;
          const weatherReading = data?.weather ?? null;
          const sparkline = data?.sparkline ?? [];
          const status = getStatus(reading, referenceMs);
          const color = resolveDeviceColor(device);

          const tempF = reading ? celsiusToFahrenheit(reading.temperature) : null;
          const humidity = reading ? reading.humidity : null;

          const weatherTs = weatherReading ? new Date(weatherReading.created_at).getTime() : null;
          const weatherFresh = weatherReading && weatherTs && referenceMs && (referenceMs - weatherTs) < WEATHER_STALE_MS;
          const tempPct = weatherFresh && tempF != null
            ? computePercentError(tempF, celsiusToFahrenheit(weatherReading.temperature)) ?? null
            : null;

          const rowClickable = !!onDeviceClick;
          const rowClasses = `group ${rowClickable ? 'cursor-pointer hover:bg-[var(--hover-bg)]' : ''} transition-colors`;

          return (
            <div
              key={device.id}
              className={rowClasses}
              onClick={rowClickable ? () => onDeviceClick(device) : undefined}
              style={{ borderLeft: `2px solid ${color}` }}
            >
              <div className="sm:grid sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_120px_auto_auto] sm:items-center sm:gap-6 px-4 py-3 flex flex-col gap-2">
                <div className="flex items-center gap-2 sm:justify-self-start">
                  <StatusDot status={status} title={status} />
                </div>

                <div className="min-w-0 sm:block flex items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    {deployment ? (
                      <>
                        <div className="text-base font-semibold text-[var(--fg)] truncate">{deployment.name}</div>
                        <div className="text-xs text-[var(--fg-muted)] truncate">
                          {device.display_name} <span className="metric">· {device.id}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-base font-medium text-[var(--fg-dim)] truncate">{device.display_name}</div>
                        <div className="text-xs text-[var(--fg-muted)] truncate metric">{device.id} · no active deployment</div>
                      </>
                    )}
                  </div>
                </div>

                <div className="sm:text-right flex items-baseline justify-between sm:block">
                  <span className="sm:hidden text-xs uppercase tracking-wider text-[var(--fg-muted)]">Temp</span>
                  {isLoading && tempF == null ? (
                    <div className="h-6 w-20 skeleton" />
                  ) : tempF != null ? (
                    <span className="metric text-xl font-semibold text-[var(--fg)]">
                      {tempF.toFixed(1)}<span className="text-xs text-[var(--fg-muted)] font-normal ml-0.5">°F</span>
                    </span>
                  ) : (
                    <span className="text-[var(--fg-muted)]">—</span>
                  )}
                </div>

                <div className="sm:text-right flex items-baseline justify-between sm:block">
                  <span className="sm:hidden text-xs uppercase tracking-wider text-[var(--fg-muted)]">Humidity</span>
                  {isLoading && humidity == null ? (
                    <div className="h-6 w-16 skeleton" />
                  ) : humidity != null ? (
                    <span className="metric text-xl font-semibold text-[var(--fg)]">
                      {humidity.toFixed(1)}<span className="text-xs text-[var(--fg-muted)] font-normal ml-0.5">%</span>
                    </span>
                  ) : (
                    <span className="text-[var(--fg-muted)]">—</span>
                  )}
                </div>

                <div className="hidden sm:block sm:justify-self-center" style={{ width: 120 }}>
                  {sparkline.length >= 2 ? (
                    <Sparkline
                      values={sparkline.map((s) => celsiusToFahrenheit(s.temperature_avg))}
                      stroke={color}
                      height={28}
                      animate={false}
                    />
                  ) : (
                    <div className="h-[28px]" />
                  )}
                </div>

                <div className="sm:text-right text-xs metric" style={{ color: deltaColor(tempPct) }}>
                  {tempPct != null ? formatPercent(tempPct) : <span className="text-[var(--fg-muted)]">—</span>}
                </div>

                <div className="sm:text-right text-xs text-[var(--fg-muted)] metric whitespace-nowrap">
                  {reading ? getTimeAgo(reading.created_at) : '—'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {onRefresh && (
        <div className="flex items-center justify-between px-4 py-2 text-[11px] text-[var(--fg-muted)]">
          <span>
            {lastRefresh ? (
              <>Last sync <span className="metric">{getTimeAgo(lastRefresh.toISOString())}</span></>
            ) : (
              'Syncing…'
            )}
          </span>
          <button
            onClick={onRefresh}
            className="text-[var(--fg-dim)] hover:text-[var(--fg)] transition-colors"
            aria-label="Refresh readings"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}
