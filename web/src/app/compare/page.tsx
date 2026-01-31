'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  DeviceStats,
  DeploymentWithCount,
  DeploymentStats,
  getDeviceStats,
  getDeployments,
  getDeployment,
  getDeploymentStats,
  celsiusToFahrenheit,
  celsiusDeltaToFahrenheit,
} from '@/lib/supabase';

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: 'Custom', hours: -1 },
];

export default function ComparePage() {
  const [stats, setStats] = useState<DeviceStats[]>([]);
  const [deploymentStats, setDeploymentStats] = useState<DeploymentStats | null>(null);
  const [selectedRange, setSelectedRange] = useState(24);
  const [isLoading, setIsLoading] = useState(true);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');

  // Filters
  const [deviceFilter, setDeviceFilter] = useState<string>('');
  const [deploymentFilter, setDeploymentFilter] = useState<string>('');
  const [deployments, setDeployments] = useState<DeploymentWithCount[]>([]);

  const isCustom = selectedRange === -1;
  const isCustomValid = !!customStart && !!customEnd && new Date(customStart).getTime() < new Date(customEnd).getTime();

  useEffect(() => {
    async function fetchDeployments() {
      const deps = await getDeployments();
      setDeployments(deps);
    }
    fetchDeployments();
  }, []);

  const getRangeBounds = useCallback(async () => {
    if (deploymentFilter) {
      const dep = await getDeployment(parseInt(deploymentFilter, 10));
      if (dep) {
        return { start: dep.started_at, end: dep.ended_at || new Date().toISOString() };
      }
    }
    if (isCustom) {
      return { start: new Date(customStart).toISOString(), end: new Date(customEnd).toISOString() };
    }
    const end = new Date();
    const start = new Date(end.getTime() - selectedRange * 60 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [selectedRange, isCustom, customStart, customEnd, deploymentFilter]);

  const fetchData = useCallback(async () => {
    if (isCustom && !isCustomValid && !deploymentFilter) return;
    setIsLoading(true);

    if (deploymentFilter) {
      // Fetch deployment-specific stats
      const depStats = await getDeploymentStats([parseInt(deploymentFilter, 10)]);
      setDeploymentStats(depStats[0] || null);
      setStats([]);
    } else {
      // Fetch device stats for time range
      const { start, end } = await getRangeBounds();
      const data = await getDeviceStats({ start, end, device_id: deviceFilter || undefined });
      setStats(data);
      setDeploymentStats(null);
    }
    setIsLoading(false);
  }, [selectedRange, isCustom, isCustomValid, customStart, customEnd, deviceFilter, deploymentFilter, getRangeBounds]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const filteredDeployments = deviceFilter ? deployments.filter(d => d.device_id === deviceFilter) : deployments;

  const statsByDevice = useMemo(() => {
    const map: Record<string, DeviceStats | null> = { node1: null, node2: null };
    for (const row of stats) {
      if (row.device_id in map) map[row.device_id] = row;
    }
    return map;
  }, [stats]);

  const formatValue = (value: number | null | undefined, decimals = 1) => {
    if (value === undefined || value === null) return '—';
    return value.toFixed(decimals);
  };

  const formatDelta = (a: number | null | undefined, b: number | null | undefined) => {
    if (a === undefined || b === undefined || a === null || b === null) return '—';
    const delta = a - b;
    const sign = delta >= 0 ? '+' : '';
    return `${sign}${delta.toFixed(1)}`;
  };

  const node1 = statsByDevice.node1;
  const node2 = statsByDevice.node2;

  const node1TempAvgF = node1?.temp_avg != null ? celsiusToFahrenheit(node1.temp_avg) : undefined;
  const node2TempAvgF = node2?.temp_avg != null ? celsiusToFahrenheit(node2.temp_avg) : undefined;
  const node1TempMinF = node1?.temp_min != null ? celsiusToFahrenheit(node1.temp_min) : undefined;
  const node2TempMinF = node2?.temp_min != null ? celsiusToFahrenheit(node2.temp_min) : undefined;
  const node1TempMaxF = node1?.temp_max != null ? celsiusToFahrenheit(node1.temp_max) : undefined;
  const node2TempMaxF = node2?.temp_max != null ? celsiusToFahrenheit(node2.temp_max) : undefined;
  const node1TempStdF = node1?.temp_stddev != null ? celsiusDeltaToFahrenheit(node1.temp_stddev) : undefined;
  const node2TempStdF = node2?.temp_stddev != null ? celsiusDeltaToFahrenheit(node2.temp_stddev) : undefined;

  // Deployment stats converted to F
  const depTempAvgF = deploymentStats?.temp_avg != null ? celsiusToFahrenheit(deploymentStats.temp_avg) : undefined;
  const depTempMinF = deploymentStats?.temp_min != null ? celsiusToFahrenheit(deploymentStats.temp_min) : undefined;
  const depTempMaxF = deploymentStats?.temp_max != null ? celsiusToFahrenheit(deploymentStats.temp_max) : undefined;
  const depTempStdF = deploymentStats?.temp_stddev != null ? celsiusDeltaToFahrenheit(deploymentStats.temp_stddev) : undefined;

  return (
    <div className="min-h-screen">
      <div className="container-responsive">
        <header className="mb-10">
          <h1 className="text-4xl font-bold text-white mb-2">Compare</h1>
          <p className="text-lg text-[#a0aec0]">Side-by-side sensor statistics</p>
        </header>

        <nav className="glass-card p-2 mb-10 inline-flex gap-2">
          <Link href="/" className="px-6 py-3 text-[#a0aec0] hover:text-white rounded-xl text-sm font-medium transition-colors">Live</Link>
          <Link href="/charts" className="px-6 py-3 text-[#a0aec0] hover:text-white rounded-xl text-sm font-medium transition-colors">Charts</Link>
          <Link href="/compare" className="nav-active px-6 py-3 text-white text-sm font-semibold">Compare</Link>
          <Link href="/deployments" className="px-6 py-3 text-[#a0aec0] hover:text-white rounded-xl text-sm font-medium transition-colors">Deployments</Link>
        </nav>

        {/* Controls */}
        <div className="flex flex-wrap gap-4 mb-8">
          {/* Time Range */}
          <div className="glass-card p-2 flex gap-1">
            {TIME_RANGES.map((range) => (
              <button key={range.hours} onClick={() => { setSelectedRange(range.hours); setDeploymentFilter(''); }}
                className={`px-5 py-2.5 text-sm rounded-xl transition-all ${selectedRange === range.hours && !deploymentFilter ? 'nav-active text-white font-semibold' : 'text-[#a0aec0] hover:text-white hover:bg-white/5'}`}>
                {range.label}
              </button>
            ))}
          </div>

          {isCustom && !deploymentFilter && (
            <div className="glass-card p-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#a0aec0]">Start</label>
                <input type="datetime-local" value={customStart} onChange={(e) => setCustomStart(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#a0aec0]">End</label>
                <input type="datetime-local" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
              </div>
              {!isCustomValid && <span className="text-xs text-[#ffb547]">Pick a valid range</span>}
            </div>
          )}

          {/* Filters */}
          <div className="glass-card p-3 flex flex-wrap items-center gap-4">
            <span className="text-xs text-[#a0aec0] font-medium">Filters:</span>
            <select value={deviceFilter} onChange={(e) => { setDeviceFilter(e.target.value); setDeploymentFilter(''); }}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[100px]">
              <option value="">All Devices</option>
              <option value="node1">Node 1</option>
              <option value="node2">Node 2</option>
            </select>
            <select value={deploymentFilter} onChange={(e) => setDeploymentFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[180px]">
              <option value="">All Deployments</option>
              {filteredDeployments.map((dep) => (
                <option key={dep.id} value={dep.id.toString()}>{dep.name} ({dep.device_id})</option>
              ))}
            </select>
          </div>
        </div>

        {/* Deployment indicator */}
        {deploymentFilter && deploymentStats && (
          <div className="mb-6 px-4 py-2 rounded-lg bg-[#0075ff]/20 border border-[#0075ff]/30 inline-flex items-center gap-2">
            <span className="text-sm text-white">
              Showing: {deploymentStats.deployment_name} ({deploymentStats.location})
            </span>
            <button onClick={() => setDeploymentFilter('')} className="text-[#a0aec0] hover:text-white">✕</button>
          </div>
        )}

        {isLoading ? (
          <>
            <div className="glass-card p-8 mb-8">
              <div className="skeleton h-8 w-48 mb-6"></div>
              <div className="space-y-4">
                {[1,2,3,4].map(i => <div key={i} className="skeleton h-12"></div>)}
              </div>
            </div>
            <div className="glass-card p-8">
              <div className="skeleton h-8 w-40 mb-6"></div>
              <div className="space-y-4">
                {[1,2,3,4].map(i => <div key={i} className="skeleton h-12"></div>)}
              </div>
            </div>
          </>
        ) : deploymentStats ? (
          // Single deployment view
          <div className="fade-in">
            <div className="glass-card p-8 mb-8">
              <h2 className="text-2xl font-bold text-white mb-6">Temperature (°F) - {deploymentStats.deployment_name}</h2>
              <div className="grid grid-cols-4 gap-6 text-center">
                <div><p className="text-[#a0aec0] text-sm mb-2">Average</p><p className="text-3xl font-bold text-white">{formatValue(depTempAvgF)}</p></div>
                <div><p className="text-[#a0aec0] text-sm mb-2">Minimum</p><p className="text-3xl font-bold text-white">{formatValue(depTempMinF)}</p></div>
                <div><p className="text-[#a0aec0] text-sm mb-2">Maximum</p><p className="text-3xl font-bold text-white">{formatValue(depTempMaxF)}</p></div>
                <div><p className="text-[#a0aec0] text-sm mb-2">Std Dev</p><p className="text-3xl font-bold text-white">{formatValue(depTempStdF, 2)}</p></div>
              </div>
            </div>
            <div className="glass-card p-8">
              <h2 className="text-2xl font-bold text-white mb-6">Humidity (%) - {deploymentStats.deployment_name}</h2>
              <div className="grid grid-cols-4 gap-6 text-center">
                <div><p className="text-[#a0aec0] text-sm mb-2">Average</p><p className="text-3xl font-bold text-white">{formatValue(deploymentStats.humidity_avg)}</p></div>
                <div><p className="text-[#a0aec0] text-sm mb-2">Minimum</p><p className="text-3xl font-bold text-white">{formatValue(deploymentStats.humidity_min)}</p></div>
                <div><p className="text-[#a0aec0] text-sm mb-2">Maximum</p><p className="text-3xl font-bold text-white">{formatValue(deploymentStats.humidity_max)}</p></div>
                <div><p className="text-[#a0aec0] text-sm mb-2">Std Dev</p><p className="text-3xl font-bold text-white">{formatValue(deploymentStats.humidity_stddev, 2)}</p></div>
              </div>
              <p className="text-center text-[#a0aec0] mt-6">{deploymentStats.reading_count.toLocaleString()} readings</p>
            </div>
          </div>
        ) : (
          // Standard device comparison view
          <div className="fade-in">
            <div className="glass-card p-8 mb-8">
              <h2 className="text-2xl font-bold text-white mb-6">Temperature (°F)</h2>
              <table className="w-full text-lg">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-4 text-[#a0aec0] font-semibold">Metric</th>
                    <th className="text-right py-4 text-[#0075ff] font-semibold">Node 1</th>
                    <th className="text-right py-4 text-[#01b574] font-semibold">Node 2</th>
                    <th className="text-right py-4 text-[#a0aec0] font-semibold">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="py-4 text-[#a0aec0]">Average</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(node1TempAvgF)}</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(node2TempAvgF)}</td>
                    <td className="py-4 text-right text-[#a0aec0]/60">{formatDelta(node1TempAvgF, node2TempAvgF)}</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-4 text-[#a0aec0]">Minimum</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(node1TempMinF)}</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(node2TempMinF)}</td>
                    <td className="py-4 text-right text-[#a0aec0]/60">{formatDelta(node1TempMinF, node2TempMinF)}</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-4 text-[#a0aec0]">Maximum</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(node1TempMaxF)}</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(node2TempMaxF)}</td>
                    <td className="py-4 text-right text-[#a0aec0]/60">{formatDelta(node1TempMaxF, node2TempMaxF)}</td>
                  </tr>
                  <tr>
                    <td className="py-4 text-[#a0aec0]">Std Dev</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(node1TempStdF, 2)}</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(node2TempStdF, 2)}</td>
                    <td className="py-4 text-right text-[#a0aec0]/60">—</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="glass-card p-8">
              <h2 className="text-2xl font-bold text-white mb-6">Humidity (%)</h2>
              <table className="w-full text-lg">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left py-4 text-[#a0aec0] font-semibold">Metric</th>
                    <th className="text-right py-4 text-[#0075ff] font-semibold">Node 1</th>
                    <th className="text-right py-4 text-[#01b574] font-semibold">Node 2</th>
                    <th className="text-right py-4 text-[#a0aec0] font-semibold">Delta</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-white/5">
                    <td className="py-4 text-[#a0aec0]">Average</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(node1?.humidity_avg)}</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(node2?.humidity_avg)}</td>
                    <td className="py-4 text-right text-[#a0aec0]/60">{formatDelta(node1?.humidity_avg, node2?.humidity_avg)}</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-4 text-[#a0aec0]">Minimum</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(node1?.humidity_min)}</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(node2?.humidity_min)}</td>
                    <td className="py-4 text-right text-[#a0aec0]/60">{formatDelta(node1?.humidity_min, node2?.humidity_min)}</td>
                  </tr>
                  <tr className="border-b border-white/5">
                    <td className="py-4 text-[#a0aec0]">Maximum</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(node1?.humidity_max)}</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(node2?.humidity_max)}</td>
                    <td className="py-4 text-right text-[#a0aec0]/60">{formatDelta(node1?.humidity_max, node2?.humidity_max)}</td>
                  </tr>
                  <tr>
                    <td className="py-4 text-[#a0aec0]">Std Dev</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(node1?.humidity_stddev, 2)}</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(node2?.humidity_stddev, 2)}</td>
                    <td className="py-4 text-right text-[#a0aec0]/60">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
