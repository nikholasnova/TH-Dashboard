'use client';

import { useState, useRef, useEffect } from 'react';
import { Reading, Deployment, ChartSample, celsiusToFahrenheit } from '@/lib/supabase';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { STALE_THRESHOLD_MS } from '@/lib/constants';
import { formatTime, formatDate, getTimeAgo, formatPercent } from '@/lib/format';
import { computePercentError } from '@/lib/weatherCompare';

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

function Sparkline({ data }: { data: ChartSample[] }) {
  const pathRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const len = el.getTotalLength();
    el.style.setProperty('--path-length', String(len));
  }, [data]);

  if (data.length < 2) return null;
  const values = data.map((s) => celsiusToFahrenheit(s.temperature_avg));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 1000;
  const h = 40;
  const pad = 2;

  let path = '';
  for (let i = 0; i < values.length; i++) {
    const x = (i / (values.length - 1)) * w;
    const y = h - pad - ((values[i] - min) / range) * (h - pad * 2);
    path += i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : ` L${x.toFixed(1)},${y.toFixed(1)}`;
  }

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height: 40 }}>
      <line x1="0" y1={h / 2} x2={w} y2={h / 2} stroke="var(--chart-grid)" strokeWidth="1" />
      <path
        ref={pathRef}
        d={path}
        fill="none"
        stroke="var(--chart-line)"
        strokeWidth="2"
        opacity={0.7}
        vectorEffect="non-scaling-stroke"
        className="sparkline-animate"
      />
    </svg>
  );
}

const WEATHER_STALE_MS = 2 * 60 * 60 * 1000; // 2 hours

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
      className={`glass-card p-4 sm:p-8 card-reading ${onClick ? 'cursor-pointer hover:border-[var(--btn-border-hover)] transition-all' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          {activeDeployment ? (
            <>
              <h2 className="text-2xl font-bold text-[var(--foreground)]">{activeDeployment.name}</h2>
              <span className="text-sm text-[var(--foreground-muted)]">{deviceName} &bull; Started {getTimeAgo(activeDeployment.started_at)}</span>
            </>
          ) : (
            <>
              <h2 className="text-xl font-medium text-[var(--foreground-secondary)]">No Active Deployment</h2>
              <span className="text-sm text-[var(--foreground-muted)]">{deviceName} ({deviceId})</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {reading && !isStale && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--success)]/8">
              <div className="w-2 h-2 rounded-full bg-[var(--success)] animate-breathe" />
              <span className="text-xs font-medium text-[var(--success)]">Live</span>
            </div>
          )}
          {reading && isStale && (
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-[var(--error)]/8">
              <div className="w-2 h-2 rounded-full bg-[var(--error)]" />
              <span className="text-xs font-medium text-[var(--error)]">Offline</span>
            </div>
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
        <LoadingSpinner message="Loading..." className="flex-1 min-h-[140px]" />
      ) : reading && !isStale ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-8 mb-4 sm:mb-8">
            <div className="rounded-xl p-3 sm:p-6 bg-[var(--hover-bg)]">
              <p className="text-xs sm:text-sm text-[var(--foreground-muted)] uppercase tracking-wider mb-2 sm:mb-3">Temperature</p>
              <p className="stat-value">
                {celsiusToFahrenheit(reading.temperature).toFixed(1)}
                <span className="text-base sm:text-xl text-[var(--foreground-muted)] font-normal ml-1">°F</span>
              </p>
              <p className="text-xs sm:text-sm text-[var(--foreground-muted)] mt-1 sm:mt-2">
                {reading.temperature.toFixed(1)}°C
              </p>
              {freshWeather && (() => {
                const sensorF = celsiusToFahrenheit(reading.temperature);
                const weatherF = celsiusToFahrenheit(freshWeather.temperature);
                const pct = computePercentError(sensorF, weatherF);
                const pctColor = pct != null ? (pct < 3 ? 'var(--success)' : pct < 5 ? 'var(--warning)' : 'var(--error)') : 'var(--foreground-muted)';
                return (
                  <p className="hidden sm:block text-xs mt-2 text-[var(--foreground-muted)]">
                    vs Official: {weatherF.toFixed(1)}°F{' '}
                    <span style={{ color: pctColor }} className="font-medium">({pct != null ? `${formatPercent(pct)} Error` : '—'})</span>
                  </p>
                );
              })()}
            </div>
            <div className="rounded-xl p-3 sm:p-6 bg-[var(--card-highlight)]">
              <p className="text-xs sm:text-sm text-[var(--foreground-muted)] uppercase tracking-wider mb-2 sm:mb-3">Humidity</p>
              <p className="stat-value">
                {reading.humidity.toFixed(1)}
                <span className="text-base sm:text-xl text-[var(--foreground-muted)] font-normal ml-1">%</span>
              </p>
              {freshWeather && (() => {
                const pct = computePercentError(reading.humidity, freshWeather.humidity);
                const pctColor = pct != null ? (pct < 3 ? 'var(--success)' : pct < 5 ? 'var(--warning)' : 'var(--error)') : 'var(--foreground-muted)';
                return (
                  <p className="hidden sm:block text-xs mt-2 text-[var(--foreground-muted)]">
                    vs Official: {freshWeather.humidity.toFixed(1)}%{' '}
                    <span style={{ color: pctColor }} className="font-medium">({pct != null ? `${formatPercent(pct)} Error` : '—'})</span>
                  </p>
                );
              })()}
            </div>
          </div>

          {sparklineData && sparklineData.length >= 2 && (
            <div className="mb-4 -mx-2">
              <Sparkline data={sparklineData} />
            </div>
          )}

          <div className="text-sm text-[var(--foreground-muted)]">
            {formatDate(reading.created_at)} at {formatTime(reading.created_at)}
          </div>
        </>
      ) : reading && isStale ? (
        <div className="flex flex-col justify-center items-center flex-1 min-h-[140px]">
          <div className="mb-4 p-3 rounded-full bg-[var(--error)]/8">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
          </div>
          <p className="text-lg font-medium text-[var(--error)] mb-1">Device Offline</p>
          <p className="text-sm text-[var(--foreground-muted)]">Last seen {getTimeAgo(reading.created_at)}</p>
          <div className="grid grid-cols-2 gap-6 mt-5 w-full opacity-50">
            <div className="text-center">
              <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider mb-1">Last Temp</p>
              <p className="text-lg text-[var(--foreground-secondary)]">{celsiusToFahrenheit(reading.temperature).toFixed(1)}°F</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-[var(--foreground-muted)] uppercase tracking-wider mb-1">Last Humidity</p>
              <p className="text-lg text-[var(--foreground-secondary)]">{reading.humidity.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col justify-center flex-1 min-h-[140px]">
          <p className="text-xl text-[var(--foreground-secondary)] font-medium text-center">No data available</p>
          <p className="text-sm text-[var(--foreground-muted)] mt-2 text-center">Waiting for sensor...</p>
        </div>
      )}
    </div>
  );
}
