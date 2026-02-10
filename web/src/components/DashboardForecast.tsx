'use client';

import { useEffect, useState } from 'react';
import { getPyodide, type LoadingStatus } from '@/lib/pyodide';
import { runDashboardForecast, type DailyForecast } from '@/lib/analysisRunner';
import { DEVICES } from '@/lib/constants';

type ForecastState =
  | { status: 'loading'; message: string }
  | { status: 'ready'; days: DailyForecast[] }
  | { status: 'no-data' }
  | { status: 'error'; message: string };

function ForecastRow({
  day,
  weekMin,
  weekMax,
}: {
  day: DailyForecast;
  weekMin: number;
  weekMax: number;
}) {
  const range = weekMax - weekMin || 1;
  const leftPct = ((day.temp_low_f - weekMin) / range) * 100;
  const widthPct = ((day.temp_high_f - day.temp_low_f) / range) * 100;

  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="w-12 text-sm text-[#a0aec0] shrink-0">
        {day.day_name}
      </span>
      <span className="w-10 text-sm text-[#0075ff] text-right shrink-0">
        {Math.round(day.temp_low_f)}°
      </span>
      <div className="flex-1 h-2 bg-white/5 rounded-full relative">
        <div
          className="absolute h-full rounded-full"
          style={{
            left: `${leftPct}%`,
            width: `${Math.max(widthPct, 4)}%`,
            background: 'linear-gradient(to right, #0075ff, #ffb547)',
          }}
        />
      </div>
      <span className="w-10 text-sm text-[#ffb547] shrink-0">
        {Math.round(day.temp_high_f)}°
      </span>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-2.5">
          <div className="w-12 h-4 bg-white/5 rounded skeleton" />
          <div className="w-10 h-4 bg-white/5 rounded skeleton" />
          <div className="flex-1 h-2 bg-white/5 rounded-full skeleton" />
          <div className="w-10 h-4 bg-white/5 rounded skeleton" />
        </div>
      ))}
    </div>
  );
}

export function DashboardForecast() {
  const [selectedDevice, setSelectedDevice] = useState<(typeof DEVICES)[number]>(DEVICES[0]);
  const [forecastState, setForecastState] = useState<ForecastState>({ status: 'loading', message: 'Loading Python runtime...' });
  const [retryKey, setRetryKey] = useState(0);

  // Single effect: load Pyodide then run forecast. Re-runs on device change or retry.
  useEffect(() => {
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

        const days = await runDashboardForecast(pyodide, selectedDevice.id);
        if (cancelled) return;

        if (days.length === 0) {
          setForecastState({ status: 'no-data' });
        } else {
          setForecastState({ status: 'ready', days });
        }
      } catch (err) {
        if (!cancelled) {
          setForecastState({ status: 'error', message: String(err) });
        }
      }
    }

    void run();
    return () => { cancelled = true; };
  }, [selectedDevice.id, retryKey]);

  return (
    <div className="glass-card p-4 sm:p-6 mt-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">7-Day Forecast</h3>
          <p className="text-xs text-[#a0aec0]">Holt-Winters triple exponential smoothing</p>
        </div>
        <div className="flex rounded-lg overflow-hidden border border-white/10">
          {DEVICES.map((device) => (
            <button
              key={device.id}
              onClick={() => setSelectedDevice(device)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedDevice.id === device.id
                  ? 'bg-white/10 text-white'
                  : 'text-[#a0aec0] hover:text-white hover:bg-white/5'
              }`}
            >
              {device.name}
            </button>
          ))}
        </div>
      </div>

      {forecastState.status === 'loading' && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 bg-[#0075ff] rounded-full animate-pulse" />
            <span className="text-xs text-[#a0aec0]">{forecastState.message}</span>
          </div>
          <SkeletonRows />
        </div>
      )}

      {forecastState.status === 'ready' && (() => {
        const weekMin = Math.min(...forecastState.days.map((d) => d.temp_low_f));
        const weekMax = Math.max(...forecastState.days.map((d) => d.temp_high_f));
        return (
          <div className="divide-y divide-white/5">
            {forecastState.days.map((day) => (
              <ForecastRow key={day.date} day={day} weekMin={weekMin} weekMax={weekMax} />
            ))}
          </div>
        );
      })()}

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
