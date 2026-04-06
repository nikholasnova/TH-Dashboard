'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { getPyodide, type LoadingStatus } from '@/lib/pyodide';
import { runHourlyForecast, type HourlyForecast } from '@/lib/analysisRunner';
import { useDevices } from '@/contexts/DevicesContext';

type ForecastState =
  | { status: 'loading'; message: string }
  | { status: 'ready'; points: HourlyForecast[] }
  | { status: 'no-data' }
  | { status: 'error'; message: string };

// Module-level cache: survives client-side navigation, clears on hard refresh
let forecastCache: Record<string, ForecastState> = {};
export function clearForecastCache() { forecastCache = {}; }

const SCROLL_COL_W = 56;
const FLUID_MIN_W = 32;
const CHART_H = 64;
const PAD_Y = 8;
const SVG_H = CHART_H + PAD_Y * 2;
const DOT_R = 3;

function useContainerWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

function HourlyStrip({ points }: { points: HourlyForecast[] }) {
  const { ref, width: containerWidth } = useContainerWidth();
  const dynamicColW = containerWidth > 0 ? containerWidth / points.length : 0;
  const useFluid = dynamicColW >= FLUID_MIN_W;
  const columnW = useFluid ? dynamicColW : SCROLL_COL_W;
  const stripWidth = useFluid ? containerWidth : points.length * SCROLL_COL_W;

  const temps = points.map((p) => p.temp_f);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const range = max - min || 1;

  const nowHour = new Date().getHours();

  function yFor(temp: number) {
    return PAD_Y + CHART_H - ((temp - min) / range) * CHART_H;
  }

  // Gridline Y positions at 25%, 50%, 75%
  const gridYs = [0.25, 0.5, 0.75].map(pct => PAD_Y + CHART_H - pct * CHART_H);

  const polyPoints = points
    .map((p, i) => `${i * columnW + columnW / 2},${yFor(p.temp_f)}`)
    .join(' ');

  if (containerWidth === 0) {
    return <div ref={ref} className="-mx-4 sm:-mx-6 px-4 sm:px-6" style={{ height: SVG_H + 44 }} />;
  }

  return (
    <div ref={ref} className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6 scrollbar-thin">
      <div style={{ width: stripWidth, minWidth: '100%' }} className="relative">
        {/* SVG curve + dots */}
        <svg
          width={stripWidth}
          height={SVG_H}
          className="block"
          viewBox={`0 0 ${stripWidth} ${SVG_H}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id="forecast-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--chart-line)" />
              <stop offset="100%" stopColor="var(--chart-line-end)" />
            </linearGradient>
          </defs>
          {/* Subtle gridlines */}
          {gridYs.map((y, i) => (
            <line key={i} x1="0" y1={y} x2={stripWidth} y2={y} stroke="var(--chart-grid)" strokeWidth="1" />
          ))}
          <polyline
            points={polyPoints}
            fill="none"
            stroke="url(#forecast-grad)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((p, i) => (
            <circle
              key={p.iso}
              cx={i * columnW + columnW / 2}
              cy={yFor(p.temp_f)}
              r={DOT_R}
              fill="var(--chart-dot)"
            />
          ))}
        </svg>

        {/* Temp labels row */}
        <div className="flex" style={{ width: stripWidth }}>
          {points.map((p) => {
            const hour = new Date(p.iso).getHours();
            const isCurrent = hour === nowHour;
            return (
              <div
                key={p.iso}
                className={`text-center text-xs pt-2 ${isCurrent ? 'font-bold text-[var(--foreground)]' : 'font-medium text-[var(--foreground-secondary)]'}`}
                style={{ width: columnW, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
              >
                {Math.round(p.temp_f)}°
              </div>
            );
          })}
        </div>

        {/* Time labels row */}
        <div className="flex" style={{ width: stripWidth }}>
          {points.map((p) => (
            <div
              key={p.iso}
              className="text-center text-[11px] text-[var(--foreground-muted)] pt-1"
              style={{ width: columnW, flexShrink: 0 }}
            >
              {p.hour_label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SkeletonStrip() {
  return (
    <div className="overflow-hidden">
      <div className="flex gap-0">
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2 py-2" style={{ width: SCROLL_COL_W, flexShrink: 0 }}>
            <div className="w-6 h-6 bg-[var(--hover-bg)] rounded-full skeleton" />
            <div className="w-8 h-3 bg-[var(--hover-bg)] rounded skeleton" />
            <div className="w-8 h-3 bg-[var(--hover-bg)] rounded skeleton" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardForecast() {
  const { devices, isLoading: devicesLoading } = useDevices();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const resolvedDeviceId = (devices.find(d => d.id === selectedId) ?? devices[0])?.id ?? null;
  const [forecastState, setForecastState] = useState<ForecastState | null>(
    () => (resolvedDeviceId && forecastCache[resolvedDeviceId]) || null
  );

  const selectedDevice = useMemo(
    () => devices.find(d => d.id === selectedId) ?? devices[0] ?? null,
    [devices, selectedId],
  );
  const deviceId = selectedDevice?.id ?? null;
  const noDevices = !devicesLoading && !deviceId;

  function runForecast() {
    if (!deviceId) return;
    setForecastState({ status: 'loading', message: 'Loading Python runtime...' });

    let cancelled = false;

    async function run() {
      try {
        const pyodide = await getPyodide((status: LoadingStatus) => {
          if (cancelled) return;
          if (status.stage === 'error') {
            setForecastState({ status: 'error', message: status.message });
          } else if (status.stage !== 'ready') {
            setForecastState({ status: 'loading', message: status.message });
          }
        });

        if (cancelled) return;
        setForecastState({ status: 'loading', message: 'Computing forecast...' });

        const points = await runHourlyForecast(pyodide, deviceId);
        if (cancelled) return;

        if (points.length === 0) {
          const state: ForecastState = { status: 'no-data' };
          forecastCache[deviceId] = state;
          setForecastState(state);
        } else {
          const state: ForecastState = { status: 'ready', points };
          forecastCache[deviceId] = state;
          setForecastState(state);
        }
      } catch (err) {
        if (!cancelled) {
          const state: ForecastState = { status: 'error', message: String(err) };
          forecastCache[deviceId] = state;
          setForecastState(state);
        }
      }
    }

    void run();
    return () => { cancelled = true; };
  }


  return (
    <div className="glass-card p-4 sm:p-6 mt-8">
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="min-w-0">
          <h3 className="text-xl sm:text-2xl font-semibold text-[var(--foreground)]">24-Hour Forecast</h3>
          <p className="text-sm sm:text-base text-[var(--foreground-muted)] truncate">Holt-Winters exponential smoothing</p>
        </div>
        <div className="relative flex rounded-xl overflow-hidden border border-[var(--glass-border)] bg-[var(--card-highlight)] shrink-0">
          {devices.map((device) => (
            <button
              key={device.id}
              onClick={() => { setSelectedId(device.id); setForecastState(forecastCache[device.id] || null); }}
              className={`relative px-4 py-2.5 sm:py-2 text-base font-medium transition-colors z-10 ${
                deviceId === device.id
                  ? 'text-[var(--background-main)]'
                  : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
              }`}
            >
              {deviceId === device.id && (
                <motion.div
                  layoutId="forecast-tab"
                  className="absolute inset-0 bg-[var(--primary)] rounded-lg"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10">{device.display_name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-center" style={{ minHeight: 140 }}>
      {noDevices ? (
        <div className="text-center">
          <p className="text-base text-[var(--foreground-secondary)]">No active devices</p>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">Add a device to see forecasts</p>
        </div>
      ) : forecastState === null ? (
        <div className="text-center">
          <p className="text-base text-[var(--foreground-muted)] mb-3">Loads Pyodide runtime (~10s on first run)</p>
          <button
            onClick={runForecast}
            className="px-5 py-2.5 text-base font-medium btn-glass text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-colors"
          >
            Run Forecast
          </button>
        </div>
      ) : forecastState.status === 'loading' ? (
        <div className="w-full">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 bg-[var(--foreground-secondary)] rounded-full" style={{ animation: 'dotPulse 1.4s ease-in-out infinite' }} />
            <span className="text-base text-[var(--foreground-muted)]">{forecastState.message}</span>
          </div>
          <SkeletonStrip />
        </div>
      ) : forecastState.status === 'ready' ? (
        <div className="w-full">
          <HourlyStrip points={forecastState.points} />
        </div>
      ) : forecastState.status === 'no-data' ? (
        <div className="text-center">
          <p className="text-base text-[var(--foreground-secondary)]">Not enough data for forecasting</p>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">Need at least 2 days of continuous readings</p>
        </div>
      ) : forecastState.status === 'error' ? (
        <div className="text-center">
          <p className="text-base text-[var(--error)]">Forecast unavailable</p>
          <p className="text-sm text-[var(--foreground-muted)] mt-1">{forecastState.message}</p>
          <button
            onClick={() => setForecastState(null)}
            className="mt-3 px-3 py-1.5 text-xs bg-[var(--hover-bg)] hover:bg-[var(--active-bg)] text-[var(--foreground-secondary)] hover:text-[var(--foreground)] rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      ) : null}
      </div>
    </div>
  );
}
