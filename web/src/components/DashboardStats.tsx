'use client';

import { useEffect, useState } from 'react';
import { DeviceStats, getDeviceStats, celsiusToFahrenheit } from '@/lib/supabase';
import { safeC2F, formatPercent } from '@/lib/format';
import { computePercentError } from '@/lib/weatherCompare';
import { REFRESH_INTERVAL } from '@/lib/constants';
import { useDevices } from '@/contexts/DevicesContext';

export function DashboardStats() {
  const { devices } = useDevices();
  const [stats, setStats] = useState<DeviceStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const now = new Date().toISOString();
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const data = await getDeviceStats({ start: twentyFourHoursAgo, end: now });
      setStats(data);
      setLoading(false);
    }
    void fetchStats();
    const interval = setInterval(() => void fetchStats(), REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="glass-card p-6 mt-8">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[var(--foreground-secondary)] rounded-full" style={{ animation: 'dotPulse 1.4s ease-in-out infinite' }} />
          <span className="text-sm text-[var(--foreground-muted)]">Loading 24h stats...</span>
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
    <div className="glass-card p-4 sm:p-6 mt-8">
      <p className="section-label">Last 24 Hours</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-0 lg:divide-x lg:divide-[var(--divider)]">
        <div className="lg:px-6 first:lg:pl-0 last:lg:pr-0">
          <div className="h-[3px] w-8 bg-[var(--primary)] rounded-full mb-3" />
          <p className="text-xs text-[var(--foreground-muted)] mb-1">Avg Temperature</p>
          <div className="space-y-0.5">
            {sensorStats.map(s => {
              const dev = devices.find(d => d.id === s.device_id);
              return s.temp_avg != null ? (
                <p key={s.device_id} className="text-lg text-[var(--foreground)] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {dev?.display_name ?? s.device_id}: {celsiusToFahrenheit(s.temp_avg).toFixed(1)}°F
                </p>
              ) : null;
            })}
          </div>
        </div>

        <div className="lg:px-6">
          <div className="h-[3px] w-8 bg-[var(--foreground-secondary)] rounded-full mb-3" />
          <p className="text-xs text-[var(--foreground-muted)] mb-1">High / Low</p>
          {highF !== null && lowF !== null ? (
            <p className="text-lg text-[var(--foreground)] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
              <span className="text-[var(--warning)]">{highF.toFixed(1)}°</span>
              {' / '}
              <span className="text-[var(--info)]">{lowF.toFixed(1)}°</span>
            </p>
          ) : (
            <p className="text-sm text-[var(--foreground-muted)]">--</p>
          )}
        </div>

        <div className="lg:px-6">
          <div className="h-[3px] w-8 bg-[var(--foreground-muted)] rounded-full mb-3" />
          <p className="text-xs text-[var(--foreground-muted)] mb-1">Readings</p>
          <p className="text-lg text-[var(--foreground)] font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {totalReadings.toLocaleString()}
          </p>
        </div>

        <div className="lg:px-6 last:lg:pr-0">
          <div className="h-[3px] w-8 bg-[var(--foreground-muted)] rounded-full mb-3" />
          <p className="text-xs text-[var(--foreground-muted)] mb-1">Sensor Accuracy</p>
          {avgPctError !== null ? (
            <div>
              <p className="text-lg font-medium" style={{ color: avgPctError < 3 ? 'var(--success)' : avgPctError < 5 ? 'var(--warning)' : 'var(--error)', fontVariantNumeric: 'tabular-nums' }}>
                {formatPercent(avgPctError)} Error
              </p>
              <div className="mt-2 h-1.5 w-full bg-[var(--hover-bg)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(100, (avgPctError / 10) * 100)}%`,
                    backgroundColor: avgPctError < 3 ? 'var(--success)' : avgPctError < 5 ? 'var(--warning)' : 'var(--error)',
                  }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--foreground-muted)]">No weather data</p>
          )}
        </div>
      </div>
    </div>
  );
}
