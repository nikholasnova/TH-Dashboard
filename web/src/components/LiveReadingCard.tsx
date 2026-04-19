'use client';

import { useState } from 'react';
import { Reading, Deployment, ChartSample, celsiusToFahrenheit } from '@/lib/supabase';
import { STALE_THRESHOLD_MS } from '@/lib/constants';
import { formatTime, formatDate, getTimeAgo, formatPercent } from '@/lib/format';
import { computePercentError } from '@/lib/weatherCompare';
import { Sparkline } from './Sparkline';
import { StatusDot } from './StatusDot';

interface LiveReadingCardProps {
  deviceId: string;
  deviceName: string;
  reading: Reading | null;
  activeDeployment?: Deployment | null;
  isLoading?: boolean;
  onClick?: () => void;
  onRefresh?: () => void;
  lastRefresh?: Date | null;
  weatherReading?: Reading | null;
  sparklineData?: ChartSample[];
}

const WEATHER_STALE_MS = 2 * 60 * 60 * 1000; // 2 hours
const WEATHER_WARN_MS = 16 * 60 * 1000; // 16 minutes (cron runs every 15m, 1m grace)

function WeatherStatus({ weatherReading, referenceMs, activeDeployment }: { weatherReading?: Reading | null; referenceMs: number | null; activeDeployment?: Deployment | null }) {
  if (!activeDeployment?.zip_code) return null;
  if (!weatherReading || !referenceMs) {
    return <span style={{ color: 'var(--error)' }}>Weather: No data</span>;
  }
  const ageMs = referenceMs - new Date(weatherReading.created_at).getTime();
  const color = ageMs < WEATHER_WARN_MS ? 'var(--foreground-muted)' : ageMs < WEATHER_STALE_MS ? 'var(--warning)' : 'var(--error)';
  return <span style={{ color }}>Weather: {getTimeAgo(weatherReading.created_at)}</span>;
}

export function LiveReadingCard({ deviceId, deviceName, reading, activeDeployment, isLoading, onClick, onRefresh, lastRefresh, weatherReading, sparklineData }: LiveReadingCardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const readingTimestampMs = reading ? new Date(reading.created_at).getTime() : null;
  const referenceTimestampMs = lastRefresh?.getTime() ?? readingTimestampMs;
  const isStale = readingTimestampMs !== null
    ? (referenceTimestampMs ?? readingTimestampMs) - readingTimestampMs > STALE_THRESHOLD_MS
    : true;
  const weatherTimestampMs = weatherReading ? new Date(weatherReading.created_at).getTime() : null;
  const freshWeather = weatherReading && weatherTimestampMs && referenceTimestampMs
    && (referenceTimestampMs - weatherTimestampMs) < WEATHER_STALE_MS
    ? weatherReading
    : null;

  return (
    <div
      className={`flex flex-col gap-3 ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          {activeDeployment ? (
            <>
              <h2 className="text-2xl sm:text-[1.7rem] font-semibold text-[var(--foreground)] tracking-tight">{activeDeployment.name}</h2>
              <span className="text-[15px] text-[var(--foreground-muted)]">{deviceName} &bull; Started {getTimeAgo(activeDeployment.started_at)}</span>
            </>
          ) : (
            <>
              <h2 className="text-xl sm:text-[1.375rem] font-medium text-[var(--foreground-secondary)]">No Active Deployment</h2>
              <span className="text-[15px] text-[var(--foreground-muted)]">{deviceName} ({deviceId})</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {reading && !isStale && (
            <span className="text-xs text-[var(--fg-muted)] metric">
              {getTimeAgo(reading.created_at)}
            </span>
          )}
          {reading && isStale && (
            <span className="inline-flex items-center gap-2 text-xs text-[var(--error)]">
              <StatusDot status="offline" title="Offline" />
              Offline
            </span>
          )}
          {onRefresh && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsRefreshing(true);
                onRefresh();
                setTimeout(() => setIsRefreshing(false), 800);
              }}
              disabled={isRefreshing}
              className="p-3 rounded-full bg-[var(--hover-bg)] hover:bg-[var(--active-bg)] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors disabled:opacity-50"
              aria-label="Refresh readings"
              title={lastRefresh ? `Last updated: ${lastRefresh.toLocaleTimeString()}` : 'Refresh'}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className={`transition-transform ${isRefreshing ? 'animate-spin' : ''}`}
              >
                <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {isLoading && !reading ? (
        <div className="animate-pulse">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-4">
            <div className="rounded-xl p-3 sm:p-4 bg-[var(--hover-bg)]">
              <div className="h-5 w-24 bg-[var(--hover-bg)] rounded mb-2 sm:mb-3 opacity-50" />
              <div className="h-10 sm:h-12 w-28 bg-[var(--hover-bg)] rounded mb-1 sm:mb-2 opacity-50" />
              <div className="h-5 w-16 bg-[var(--hover-bg)] rounded opacity-50" />
              <div className="hidden sm:block h-4 w-36 bg-[var(--hover-bg)] rounded mt-2 opacity-50" />
            </div>
            <div className="rounded-xl p-3 sm:p-4 bg-[var(--card-highlight)]">
              <div className="h-5 w-20 bg-[var(--hover-bg)] rounded mb-2 sm:mb-3 opacity-50" />
              <div className="h-10 sm:h-12 w-24 bg-[var(--hover-bg)] rounded mb-1 sm:mb-2 opacity-50" />
              <div className="hidden sm:block h-4 w-36 bg-[var(--hover-bg)] rounded mt-2 opacity-50" />
            </div>
          </div>
          <div className="mb-4 -mx-2" style={{ height: 52 }}>
            <div className="h-full w-full bg-[var(--hover-bg)] rounded opacity-30" />
          </div>
          <div className="h-5 w-44 bg-[var(--hover-bg)] rounded opacity-50" />
        </div>
      ) : reading && !isStale ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-4">
            <div className="rounded-xl p-3 sm:p-4 bg-[var(--hover-bg)] flex flex-col">
              <p className="text-[15px] text-[var(--foreground-muted)] uppercase tracking-wider mb-2 sm:mb-3">Temperature</p>
              <p className="stat-value">
                {celsiusToFahrenheit(reading.temperature).toFixed(1)}
                <span className="text-[17px] sm:text-[1.375rem] text-[var(--foreground-muted)] font-normal ml-1">°F</span>
              </p>
              <p className="text-[15px] text-[var(--foreground-muted)] mt-1 sm:mt-2">
                {reading.temperature.toFixed(1)}°C
              </p>
              <div className="flex-1" />
              {freshWeather && (() => {
                const sensorF = celsiusToFahrenheit(reading.temperature);
                const weatherF = celsiusToFahrenheit(freshWeather.temperature);
                const pct = computePercentError(sensorF, weatherF);
                const pctColor = pct != null ? (pct < 3 ? 'var(--success)' : pct < 5 ? 'var(--warning)' : 'var(--error)') : 'var(--fg-muted)';
                return (
                  <div className="hidden sm:block mt-2">
                    <p className="text-[15px] font-medium" style={{ color: pctColor }}>
                      {pct != null ? `${formatPercent(pct)} Error` : '—'}
                    </p>
                    <p className="text-[13px] text-[var(--fg-muted)] metric">Weather: {weatherF.toFixed(1)}°F</p>
                  </div>
                );
              })()}
            </div>
            <div className="rounded-xl p-3 sm:p-4 bg-[var(--card-highlight)] flex flex-col">
              <p className="text-[15px] text-[var(--foreground-muted)] uppercase tracking-wider mb-2 sm:mb-3">Humidity</p>
              <p className="stat-value">
                {reading.humidity.toFixed(1)}
                <span className="text-[17px] sm:text-[1.375rem] text-[var(--foreground-muted)] font-normal ml-1">%</span>
              </p>
              <div className="flex-1" />
              {freshWeather && (() => {
                const pct = computePercentError(reading.humidity, freshWeather.humidity);
                const pctColor = pct != null ? (pct < 3 ? 'var(--success)' : pct < 5 ? 'var(--warning)' : 'var(--error)') : 'var(--fg-muted)';
                return (
                  <div className="hidden sm:block mt-2">
                    <p className="text-[15px] font-medium" style={{ color: pctColor }}>
                      {pct != null ? `${formatPercent(pct)} Error` : '—'}
                    </p>
                    <p className="text-[13px] text-[var(--fg-muted)] metric">Weather: {freshWeather.humidity.toFixed(1)}%</p>
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="mb-4 -mx-2" style={{ height: 52 }}>
            {sparklineData && sparklineData.length >= 2 && (
              <Sparkline values={sparklineData.map((s) => celsiusToFahrenheit(s.temperature_avg))} />
            )}
          </div>

          <div className="text-[15px] text-[var(--foreground-muted)]">
            {formatDate(reading.created_at)} at {formatTime(reading.created_at)}
          </div>
          {activeDeployment?.zip_code && (
            <div className="text-sm mt-1">
              <WeatherStatus weatherReading={weatherReading} referenceMs={referenceTimestampMs} activeDeployment={activeDeployment} />
            </div>
          )}
        </>
      ) : reading && isStale ? (
        <div className="flex flex-col justify-center items-center flex-1 min-h-[200px] text-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-3">
            <line x1="1" y1="1" x2="23" y2="23" />
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
            <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <line x1="12" y1="20" x2="12.01" y2="20" />
          </svg>
          <p className="text-lg font-medium text-[var(--error)] mb-1">Device Offline</p>
          <p className="text-sm text-[var(--fg-muted)]">Last seen <span className="metric">{getTimeAgo(reading.created_at)}</span></p>
          {activeDeployment?.zip_code && (
            <p className="text-sm mt-1">
              <WeatherStatus weatherReading={weatherReading} referenceMs={referenceTimestampMs} activeDeployment={activeDeployment} />
            </p>
          )}
          <div className="grid grid-cols-2 gap-6 mt-5 w-full opacity-50">
            <div>
              <p className="text-xs text-[var(--fg-muted)] uppercase tracking-wider mb-1">Last Temp</p>
              <p className="text-base text-[var(--fg-dim)] metric">{celsiusToFahrenheit(reading.temperature).toFixed(1)}°F</p>
            </div>
            <div>
              <p className="text-xs text-[var(--fg-muted)] uppercase tracking-wider mb-1">Last Humidity</p>
              <p className="text-base text-[var(--fg-dim)] metric">{reading.humidity.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col justify-center items-center flex-1 min-h-[200px] text-center">
          <p className="text-base font-medium text-[var(--fg-dim)]">No data available</p>
          <p className="text-sm text-[var(--fg-muted)] mt-2">Waiting for sensor…</p>
        </div>
      )}
    </div>
  );
}
