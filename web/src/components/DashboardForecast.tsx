'use client';

import { useEffect, useState, useMemo } from 'react';
import { getPyodide, type LoadingStatus } from '@/lib/pyodide';
import { runHourlyForecast, type HourlyForecast } from '@/lib/analysisRunner';
import { useDevices } from '@/contexts/DevicesContext';

type ForecastState =
  | { status: 'loading'; message: string }
  | { status: 'ready'; points: HourlyForecast[] }
  | { status: 'no-data' }
  | { status: 'error'; message: string };

const COLUMN_W = 56;
const CHART_H = 64;
const PAD_Y = 8;
const SVG_H = CHART_H + PAD_Y * 2;
const DOT_R = 3;

function HourlyStrip({ points }: { points: HourlyForecast[] }) {
  const temps = points.map((p) => p.temp_f);
  const min = Math.min(...temps);
  const max = Math.max(...temps);
  const range = max - min || 1;

  function yFor(temp: number) {
    return PAD_Y + CHART_H - ((temp - min) / range) * CHART_H;
  }

  const svgWidth = points.length * COLUMN_W;
  const polyPoints = points
    .map((p, i) => `${i * COLUMN_W + COLUMN_W / 2},${yFor(p.temp_f)}`)
    .join(' ');

  return (
    <div className="overflow-x-auto -mx-4 sm:-mx-6 px-4 sm:px-6 scrollbar-thin">
      <div style={{ width: svgWidth, minWidth: '100%' }} className="relative">
        {/* SVG curve + dots */}
        <svg
          width={svgWidth}
          height={SVG_H}
          className="block"
          viewBox={`0 0 ${svgWidth} ${SVG_H}`}
          preserveAspectRatio="none"
        >
          <polyline
            points={polyPoints}
            fill="none"
            stroke="url(#forecast-grad)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <defs>
            <linearGradient id="forecast-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#0075ff" />
              <stop offset="100%" stopColor="#ffb547" />
            </linearGradient>
          </defs>
          {points.map((p, i) => (
            <circle
              key={p.iso}
              cx={i * COLUMN_W + COLUMN_W / 2}
              cy={yFor(p.temp_f)}
              r={DOT_R}
              fill="white"
            />
          ))}
        </svg>

        {/* Temp labels row */}
        <div className="flex" style={{ width: svgWidth }}>
          {points.map((p) => (
            <div
              key={p.iso}
              className="text-center text-xs font-medium text-white pt-2"
              style={{ width: COLUMN_W, flexShrink: 0 }}
            >
              {Math.round(p.temp_f)}°
            </div>
          ))}
        </div>

        {/* Time labels row */}
        <div className="flex" style={{ width: svgWidth }}>
          {points.map((p) => (
            <div
              key={p.iso}
              className="text-center text-[10px] text-[#a0aec0] pt-1"
              style={{ width: COLUMN_W, flexShrink: 0 }}
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
          <div key={i} className="flex flex-col items-center gap-2 py-2" style={{ width: COLUMN_W, flexShrink: 0 }}>
            <div className="w-6 h-6 bg-white/5 rounded-full skeleton" />
            <div className="w-8 h-3 bg-white/5 rounded skeleton" />
            <div className="w-8 h-3 bg-white/5 rounded skeleton" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardForecast() {
  const { devices, isLoading: devicesLoading } = useDevices();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [forecastState, setForecastState] = useState<ForecastState>({ status: 'loading', message: 'Loading Python runtime...' });
  const [retryKey, setRetryKey] = useState(0);

  const selectedDevice = useMemo(
    () => devices.find(d => d.id === selectedId) ?? devices[0] ?? null,
    [devices, selectedId],
  );
  const deviceId = selectedDevice?.id ?? null;
  const noDevices = !devicesLoading && !deviceId;

  useEffect(() => {
    if (!deviceId) return;
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
          setForecastState({ status: 'no-data' });
        } else {
          setForecastState({ status: 'ready', points });
        }
      } catch (err) {
        if (!cancelled) {
          setForecastState({ status: 'error', message: String(err) });
        }
      }
    }

    void run();
    return () => { cancelled = true; };
  }, [deviceId, retryKey]);

  return (
    <div className="glass-card p-4 sm:p-6 mt-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">24-Hour Forecast</h3>
          <p className="text-xs text-[#a0aec0]">Holt-Winters exponential smoothing</p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {devices.map((device) => (
            <button
              key={device.id}
              onClick={() => setSelectedId(device.id)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                deviceId === device.id
                  ? 'bg-white/10 text-white'
                  : 'text-[#a0aec0] hover:text-white hover:bg-white/5'
              }`}
            >
              {device.display_name}
            </button>
          ))}
        </div>
      </div>

      {noDevices && (
        <div className="text-center py-8">
          <p className="text-sm text-[#a0aec0]">No active devices</p>
          <p className="text-xs text-[#a0aec0]/60 mt-1">Add a device to see forecasts</p>
        </div>
      )}

      {!noDevices && forecastState.status === 'loading' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 bg-[#0075ff] rounded-full animate-pulse" />
            <span className="text-xs text-[#a0aec0]">{forecastState.message}</span>
          </div>
          <SkeletonStrip />
        </div>
      )}

      {forecastState.status === 'ready' && (
        <HourlyStrip points={forecastState.points} />
      )}

      {forecastState.status === 'no-data' && (
        <div className="text-center py-8">
          <p className="text-sm text-[#a0aec0]">Not enough data for forecasting</p>
          <p className="text-xs text-[#a0aec0]/60 mt-1">Need at least 2 days of continuous readings</p>
        </div>
      )}

      {forecastState.status === 'error' && (
        <div className="text-center py-8">
          <p className="text-sm text-[#e31a1a]">Forecast unavailable</p>
          <p className="text-xs text-[#a0aec0]/60 mt-1">{forecastState.message}</p>
          <button
            onClick={() => setRetryKey((k) => k + 1)}
            className="mt-3 px-3 py-1.5 text-xs bg-white/5 hover:bg-white/10 text-[#a0aec0] hover:text-white rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
