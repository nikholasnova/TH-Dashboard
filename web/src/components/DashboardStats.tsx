'use client';

import { useEffect, useState } from 'react';
import { DeviceStats, getDeviceStats, celsiusToFahrenheit } from '@/lib/supabase';
import { safeC2F } from '@/lib/format';

export function DashboardStats() {
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

  const node1 = stats.find((s) => s.device_id === 'node1');
  const node2 = stats.find((s) => s.device_id === 'node2');
  const weatherNode1 = stats.find((s) => s.device_id === 'weather_node1');
  const weatherNode2 = stats.find((s) => s.device_id === 'weather_node2');

  const allSensorStats = [node1, node2].filter(Boolean) as DeviceStats[];
  const allHighs = allSensorStats.map((s) => s.temp_max).filter((v): v is number => v !== null);
  const allLows = allSensorStats.map((s) => s.temp_min).filter((v): v is number => v !== null);
  const highF = allHighs.length > 0 ? celsiusToFahrenheit(Math.max(...allHighs)) : null;
  const lowF = allLows.length > 0 ? celsiusToFahrenheit(Math.min(...allLows)) : null;

  const totalReadings = allSensorStats.reduce((sum, s) => sum + (s.reading_count || 0), 0);

  const deltas: number[] = [];
  const n1F = safeC2F(node1?.temp_avg);
  const w1F = safeC2F(weatherNode1?.temp_avg);
  const n2F = safeC2F(node2?.temp_avg);
  const w2F = safeC2F(weatherNode2?.temp_avg);
  if (n1F != null && w1F != null) deltas.push(Math.abs(n1F - w1F));
  if (n2F != null && w2F != null) deltas.push(Math.abs(n2F - w2F));
  const avgAccuracy = deltas.length > 0 ? deltas.reduce((a, b) => a + b, 0) / deltas.length : null;

  if (allSensorStats.length === 0) return null;

  return (
    <div className="glass-card p-4 sm:p-6 mt-8">
      <p className="text-xs text-[#a0aec0] uppercase tracking-wider mb-4">Last 24 Hours</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-0 lg:divide-x lg:divide-white/10">
        <div className="lg:px-6 first:lg:pl-0 last:lg:pr-0">
          <p className="text-xs text-[#a0aec0] mb-1">Avg Temperature</p>
          <div className="space-y-0.5">
            {node1?.temp_avg !== null && node1 && (
              <p className="text-lg text-white font-medium">
                N1: {celsiusToFahrenheit(node1.temp_avg!).toFixed(1)}°F
              </p>
            )}
            {node2?.temp_avg !== null && node2 && (
              <p className="text-lg text-white font-medium">
                N2: {celsiusToFahrenheit(node2.temp_avg!).toFixed(1)}°F
              </p>
            )}
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
