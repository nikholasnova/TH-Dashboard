'use client';

import { useEffect, useState } from 'react';
import { DeviceStats, getDeviceStats, celsiusToFahrenheit } from '@/lib/supabase';
import { safeC2F } from '@/lib/format';
import { useDevices } from '@/contexts/DevicesContext';

export function DashboardStats() {
  const { devices } = useDevices();
  const [stats, setStats] = useState<DeviceStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const now = new Date().toISOString();
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const data = await getDeviceStats({ start: twentyFourHoursAgo, end: now });
      setStats(data);
      setLoading(false);
    }
    void fetch();
  }, []);

  if (loading) {
    return (
      <div className="glass-card p-6 mt-8">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#a0aec0] rounded-full animate-pulse" />
          <span className="text-sm text-[#a0aec0]">Loading 24h stats...</span>
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

  const deltas: number[] = [];
  for (const device of devices) {
    const sF = safeC2F(stats.find(s => s.device_id === device.id)?.temp_avg);
    const wF = safeC2F(stats.find(s => s.device_id === `weather_${device.id}`)?.temp_avg);
    if (sF != null && wF != null) deltas.push(Math.abs(sF - wF));
  }
  const avgAccuracy = deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;

  if (sensorStats.length === 0) return null;

  return (
    <div className="glass-card p-4 sm:p-6 mt-8">
      <p className="text-xs text-[#a0aec0] uppercase tracking-wider mb-4">Last 24 Hours</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-0 lg:divide-x lg:divide-white/10">
        <div className="lg:px-6 first:lg:pl-0 last:lg:pr-0">
          <p className="text-xs text-[#a0aec0] mb-1">Avg Temperature</p>
          <div className="space-y-0.5">
            {sensorStats.map(s => {
              const dev = devices.find(d => d.id === s.device_id);
              return s.temp_avg != null ? (
                <p key={s.device_id} className="text-lg text-white font-medium">
                  {dev?.display_name ?? s.device_id}: {celsiusToFahrenheit(s.temp_avg).toFixed(1)}°F
                </p>
              ) : null;
            })}
          </div>
        </div>

        <div className="lg:px-6">
          <p className="text-xs text-[#a0aec0] mb-1">High / Low</p>
          {highF !== null && lowF !== null ? (
            <p className="text-lg text-white font-medium">
              <span className="text-[#ffb547]">{highF.toFixed(1)}°</span>
              {' / '}
              <span className="text-[#0075ff]">{lowF.toFixed(1)}°</span>
            </p>
          ) : (
            <p className="text-sm text-[#a0aec0]">--</p>
          )}
        </div>

        <div className="lg:px-6">
          <p className="text-xs text-[#a0aec0] mb-1">Readings</p>
          <p className="text-lg text-white font-medium">
            {totalReadings.toLocaleString()}
          </p>
        </div>

        <div className="lg:px-6 last:lg:pr-0">
          <p className="text-xs text-[#a0aec0] mb-1">Sensor Accuracy</p>
          {avgAccuracy !== null ? (
            <p className="text-lg font-medium" style={{ color: avgAccuracy < 3 ? '#01b574' : avgAccuracy < 5 ? '#ffb547' : '#e31a1a' }}>
              ±{avgAccuracy.toFixed(1)}°F
            </p>
          ) : (
            <p className="text-sm text-[#a0aec0]">No weather data</p>
          )}
        </div>
      </div>
    </div>
  );
}
