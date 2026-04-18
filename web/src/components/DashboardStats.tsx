'use client';

import { DeviceStats, Deployment, celsiusToFahrenheit } from '@/lib/supabase';
import { safeC2F, formatPercent } from '@/lib/format';
import { computePercentError } from '@/lib/weatherCompare';
import { useDevices } from '@/contexts/DevicesContext';

interface DashboardStatsProps {
  stats: DeviceStats[];
  loading: boolean;
  deployments?: Record<string, Deployment | null>;
}

export function DashboardStats({ stats, loading, deployments }: DashboardStatsProps) {
  const { devices } = useDevices();

  if (loading) {
    return (
      <div className="glass-card p-3 sm:p-4 animate-pulse">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 lg:gap-0 lg:divide-x lg:divide-[var(--divider)]">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="lg:px-6 first:lg:pl-0 last:lg:pr-0">
              <div className="h-3 w-24 bg-[var(--hover-bg)] rounded mb-2 opacity-50" />
              <div className="h-6 w-20 bg-[var(--hover-bg)] rounded opacity-50" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const sensorStats = devices
    .map(d => stats.find(s => s.device_id === d.id))
    .filter((s): s is DeviceStats => s != null);
  const allHighs = sensorStats.map((s) => s.temp_max).filter((v): v is number => v !== null);
  const allLows = sensorStats.map((s) => s.temp_min).filter((v): v is number => v !== null);
  const highF = allHighs.length > 0 ? celsiusToFahrenheit(Math.max(...allHighs)) : null;
  const lowF = allLows.length > 0 ? celsiusToFahrenheit(Math.min(...allLows)) : null;

  const totalReadings = sensorStats.reduce((sum, s) => sum + (s.reading_count || 0), 0);
  const READINGS_PER_HOUR = 20; // 60min / 3min = 20 readings per hour
  // eslint-disable-next-line react-hooks/purity -- Date.now() is acceptable here; component re-renders on 30s poll
  const now = Date.now();
  const twentyFourHoursMs = 24 * 60 * 60 * 1000;
  const expectedReadings = sensorStats.reduce((sum, s) => {
    const dep = deployments?.[s.device_id];
    const windowStartMs = dep
      ? Math.max(new Date(dep.started_at).getTime(), now - twentyFourHoursMs)
      : now - twentyFourHoursMs;
    const hoursActive = Math.max(0, (now - windowStartMs) / (60 * 60 * 1000));
    return sum + Math.round(hoursActive * READINGS_PER_HOUR);
  }, 0);
  const uptimePct = expectedReadings > 0 ? Math.min(100, (totalReadings / expectedReadings) * 100) : null;

  const pctErrors: number[] = [];
  for (const device of devices) {
    const sF = safeC2F(stats.find(s => s.device_id === device.id)?.temp_avg);
    const wF = safeC2F(stats.find(s => s.device_id === `weather_${device.id}`)?.temp_avg);
    const pct = computePercentError(sF, wF);
    if (pct != null) pctErrors.push(pct);
  }
  const avgPctError = pctErrors.length > 0 ? pctErrors.reduce((a, b) => a + b, 0) / pctErrors.length : null;

  if (sensorStats.length === 0) return null;

  return (
    <div className="glass-card p-3 sm:p-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 lg:gap-0 lg:divide-x lg:divide-[var(--divider)]">
        <div className="lg:px-6 first:lg:pl-0 last:lg:pr-0">
          <p className="eyebrow mb-2">Avg Temperature</p>
          <div className="space-y-0.5">
            {sensorStats.map(s => {
              const dev = devices.find(d => d.id === s.device_id);
              return s.temp_avg != null ? (
                <p key={s.device_id} className="text-base sm:text-base text-[var(--foreground)] font-medium truncate" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  <span className="hidden sm:inline">{dev?.display_name ?? s.device_id}: </span>{celsiusToFahrenheit(s.temp_avg).toFixed(1)}°F
                </p>
              ) : null;
            })}
          </div>
        </div>

        <div className="lg:px-6">
          <p className="eyebrow mb-2">High / Low</p>
          {highF !== null && lowF !== null ? (
            <p className="text-lg sm:text-base text-[var(--foreground)] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <span className="text-[var(--warning)]">{highF.toFixed(1)}°</span>
              {' / '}
              <span className="text-[var(--info)]">{lowF.toFixed(1)}°</span>
            </p>
          ) : (
            <p className="text-sm sm:text-base text-[var(--foreground-muted)]">--</p>
          )}
        </div>

        <div className="lg:px-6">
          <p className="eyebrow mb-2">Uptime (24h)</p>
          {uptimePct != null ? (
            <div>
              <p className="text-lg sm:text-base font-medium" style={{ color: uptimePct >= 95 ? 'var(--success)' : uptimePct >= 80 ? 'var(--warning)' : 'var(--error)', fontVariantNumeric: 'tabular-nums' }}>
                {uptimePct.toFixed(1)}%
              </p>
              <div className="mt-2 h-1.5 w-full bg-[var(--hover-bg)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, uptimePct)}%`,
                    backgroundColor: uptimePct >= 95 ? 'var(--success)' : uptimePct >= 80 ? 'var(--warning)' : 'var(--error)',
                  }}
                />
              </div>
              <p className="text-xs text-[var(--foreground-muted)] mt-1" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {totalReadings.toLocaleString()} / {expectedReadings} readings
              </p>
            </div>
          ) : (
            <p className="text-sm sm:text-base text-[var(--foreground-muted)]">--</p>
          )}
        </div>

        <div className="lg:px-6 last:lg:pr-0">
          <p className="eyebrow mb-2">Sensor Accuracy</p>
          {avgPctError !== null ? (
            <div>
              <p className="text-lg sm:text-base font-medium" style={{ color: avgPctError < 3 ? 'var(--success)' : avgPctError < 5 ? 'var(--warning)' : 'var(--error)', fontVariantNumeric: 'tabular-nums' }}>
                {formatPercent(avgPctError)} Error
              </p>
              <div className="mt-2 h-1.5 w-full bg-[var(--hover-bg)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${Math.min(100, (avgPctError / 10) * 100)}%`,
                    backgroundColor: avgPctError < 3 ? 'var(--success)' : avgPctError < 5 ? 'var(--warning)' : 'var(--error)',
                  }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm sm:text-base text-[var(--foreground-muted)]">No weather data</p>
          )}
        </div>
      </div>
    </div>
  );
}
