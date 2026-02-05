'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { AuthGate } from '@/components/AuthGate';
import { Navbar } from '@/components/Navbar';
import {
  ChartSample,
  DeploymentWithCount,
  getAllReadings,
  getAllReadingsRange,
  getChartSamples,
  getDeployments,
  getDeployment,
  celsiusToFahrenheit,
} from '@/lib/supabase';

const ResponsiveLine = dynamic(
  () => import('@nivo/line').then((m) => m.ResponsiveLine),
  { ssr: false }
);

const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: 'Custom', hours: -1 },
];

type MetricType = 'temperature' | 'humidity' | 'both';

export default function ChartsPage() {
  const [samples, setSamples] = useState<ChartSample[]>([]);
  const [selectedRange, setSelectedRange] = useState(24);
  const [metric, setMetric] = useState<MetricType>('temperature');
  const [isLoading, setIsLoading] = useState(true);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [deviceFilter, setDeviceFilter] = useState<string>('');
  const [deploymentFilter, setDeploymentFilter] = useState<string>('');
  const [deployments, setDeployments] = useState<DeploymentWithCount[]>([]);

  const isCustom = selectedRange === -1;
  const isCustomValid =
    !!customStart &&
    !!customEnd &&
    new Date(customStart).getTime() < new Date(customEnd).getTime();

  useEffect(() => {
    async function fetchDeployments() {
      const deps = await getDeployments();
      setDeployments(deps);
    }
    fetchDeployments();
  }, []);

  const getRangeBounds = useCallback(async () => {
    // If deployment is selected, use its time range
    if (deploymentFilter) {
      const dep = await getDeployment(parseInt(deploymentFilter, 10));
      if (dep) {
        return {
          start: dep.started_at,
          end: dep.ended_at || new Date().toISOString(),
        };
      }
    }

    if (isCustom) {
      return {
        start: new Date(customStart).toISOString(),
        end: new Date(customEnd).toISOString(),
      };
    }
    const end = new Date();
    const start = new Date(end.getTime() - selectedRange * 60 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
  }, [selectedRange, isCustom, customStart, customEnd, deploymentFilter]);

  const pickBucketSeconds = (rangeMs: number) => {
    const minutes = rangeMs / 60000;
    if (minutes <= 360) return 180;
    if (minutes <= 1440) return 360;
    if (minutes <= 10080) return 1800;
    return 3600;
  };

  const fetchData = useCallback(async () => {
    if (isCustom && !isCustomValid && !deploymentFilter) return;
    setIsLoading(true);
    const { start, end } = await getRangeBounds();
    const rangeMs = new Date(end).getTime() - new Date(start).getTime();
    const bucketSeconds = pickBucketSeconds(rangeMs);
    const data = await getChartSamples({
      start,
      end,
      bucketSeconds,
      device_id: deviceFilter || undefined,
    });
    setSamples(data);
    setIsLoading(false);
  }, [selectedRange, isCustom, isCustomValid, customStart, customEnd, deviceFilter, deploymentFilter, getRangeBounds]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setExportError(null);
  }, [selectedRange, customStart, customEnd, deviceFilter, deploymentFilter]);

  const exportCSV = async () => {
    if (isCustom && !isCustomValid && !deploymentFilter) return;
    setIsExporting(true);
    setExportError(null);

    const { start, end } = await getRangeBounds();
    let rawReadings = isCustom || deploymentFilter
      ? await getAllReadingsRange({ start, end })
      : await getAllReadings(selectedRange);

    if (deviceFilter) {
      rawReadings = rawReadings.filter(r => r.device_id === deviceFilter);
    }

    if (rawReadings.length === 0) {
      setExportError('No data to export');
      setIsExporting(false);
      return;
    }

    const headers = ['timestamp', 'device_id', 'temperature_f', 'temperature_c', 'humidity'];
    const rows = rawReadings.map((r) => [
      r.created_at,
      r.device_id,
      celsiusToFahrenheit(r.temperature).toFixed(2),
      r.temperature.toFixed(2),
      r.humidity.toFixed(2),
    ]);

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const label = deploymentFilter ? `dep-${deploymentFilter}` : isCustom ? 'custom' : `${selectedRange}h`;
    a.download = `readings-${label}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setIsExporting(false);
  };

  const filteredDeployments = deviceFilter
    ? deployments.filter(d => d.device_id === deviceFilter)
    : deployments;

  // Calculate temp range for normalizing humidity in "both" mode
  const tempValues = samples.map((r) => celsiusToFahrenheit(r.temperature_avg));
  const tempMin = tempValues.length > 0 ? Math.min(...tempValues) : 0;
  const tempMax = tempValues.length > 0 ? Math.max(...tempValues) : 100;
  const humidityValues = samples.map((r) => r.humidity_avg);
  const humidityMin = humidityValues.length > 0 ? Math.min(...humidityValues) : 0;
  const humidityMax = humidityValues.length > 0 ? Math.max(...humidityValues) : 100;

  // Normalize humidity to temperature scale for dual-axis display
  const normalizeHumidity = (h: number) => {
    if (humidityMax === humidityMin) return tempMin;
    return tempMin + ((h - humidityMin) / (humidityMax - humidityMin)) * (tempMax - tempMin);
  };

  const buildChartData = () => {
    if (metric === 'both') {
      if (deviceFilter) {
        const deviceLabel = deviceFilter === 'node1' ? 'Node 1' : 'Node 2';
        return [
          {
            id: `${deviceLabel} Temp`,
            color: '#0075ff',
            data: samples.map((r) => ({
              x: new Date(r.bucket_ts),
              y: celsiusToFahrenheit(r.temperature_avg),
              rawValue: celsiusToFahrenheit(r.temperature_avg),
              unit: '°F',
            })),
          },
          {
            id: `${deviceLabel} Humidity`,
            color: '#01b574',
            data: samples.map((r) => ({
              x: new Date(r.bucket_ts),
              y: normalizeHumidity(r.humidity_avg),
              rawValue: r.humidity_avg,
              unit: '%',
            })),
          },
        ];
      } else {
        return [
          {
            id: 'Node 1 Temp',
            color: '#0075ff',
            data: samples.filter((r) => r.device_id === 'node1').map((r) => ({
              x: new Date(r.bucket_ts),
              y: celsiusToFahrenheit(r.temperature_avg),
              rawValue: celsiusToFahrenheit(r.temperature_avg),
              unit: '°F',
            })),
          },
          {
            id: 'Node 1 Humidity',
            color: '#21d4fd',
            data: samples.filter((r) => r.device_id === 'node1').map((r) => ({
              x: new Date(r.bucket_ts),
              y: normalizeHumidity(r.humidity_avg),
              rawValue: r.humidity_avg,
              unit: '%',
            })),
          },
          {
            id: 'Node 2 Temp',
            color: '#01b574',
            data: samples.filter((r) => r.device_id === 'node2').map((r) => ({
              x: new Date(r.bucket_ts),
              y: celsiusToFahrenheit(r.temperature_avg),
              rawValue: celsiusToFahrenheit(r.temperature_avg),
              unit: '°F',
            })),
          },
          {
            id: 'Node 2 Humidity',
            color: '#05cd99',
            data: samples.filter((r) => r.device_id === 'node2').map((r) => ({
              x: new Date(r.bucket_ts),
              y: normalizeHumidity(r.humidity_avg),
              rawValue: r.humidity_avg,
              unit: '%',
            })),
          },
        ];
      }
    }

    if (deviceFilter) {
      return [{
        id: deviceFilter === 'node1' ? 'Node 1' : 'Node 2',
        color: deviceFilter === 'node1' ? '#0075ff' : '#01b574',
        data: samples.map((r) => ({
          x: new Date(r.bucket_ts),
          y: metric === 'temperature' ? celsiusToFahrenheit(r.temperature_avg) : r.humidity_avg,
        })),
      }];
    }
    return [
      {
        id: 'Node 1',
        color: '#0075ff',
        data: samples
          .filter((r) => r.device_id === 'node1')
          .map((r) => ({
            x: new Date(r.bucket_ts),
            y: metric === 'temperature' ? celsiusToFahrenheit(r.temperature_avg) : r.humidity_avg,
          })),
      },
      {
        id: 'Node 2',
        color: '#01b574',
        data: samples
          .filter((r) => r.device_id === 'node2')
          .map((r) => ({
            x: new Date(r.bucket_ts),
            y: metric === 'temperature' ? celsiusToFahrenheit(r.temperature_avg) : r.humidity_avg,
          })),
      },
    ];
  };

  const chartData = buildChartData();
  const hasData = chartData.some((series) => series.data.length > 0);

  // Compute area baseline from actual chart data so the fill doesn't extend below the chart
  const chartYMin = hasData
    ? Math.min(...chartData.flatMap(s => s.data.map(d => d.y as number)))
    : 0;

  return (
    <AuthGate>
      <div className="min-h-screen">
        <div className="container-responsive">
          {/* flex-col-reverse puts nav above header on mobile */}
          <div className="flex flex-col-reverse sm:flex-col">
            <header className="mb-6 sm:mb-10">
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">Charts</h1>
              <p className="text-base sm:text-lg text-[#a0aec0]">Historical data visualization</p>
            </header>
            <Navbar />
          </div>

        <div className="flex flex-wrap gap-4 mb-8">
          <div className="glass-card p-2 flex gap-1">
            {TIME_RANGES.map((range) => (
              <button
                key={range.hours}
                onClick={() => setSelectedRange(range.hours)}
                className={`px-5 py-2.5 text-sm rounded-xl transition-all ${
                  selectedRange === range.hours
                    ? 'nav-active text-white font-semibold'
                    : 'text-[#a0aec0] hover:text-white hover:bg-white/5'
                }`}
              >
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

          <div className="glass-card p-2 flex gap-1">
            <button onClick={() => setMetric('temperature')}
              className={`px-5 py-2.5 text-sm rounded-xl transition-all ${metric === 'temperature' ? 'nav-active text-white font-semibold' : 'text-[#a0aec0] hover:text-white hover:bg-white/5'}`}>
              Temp
            </button>
            <button onClick={() => setMetric('humidity')}
              className={`px-5 py-2.5 text-sm rounded-xl transition-all ${metric === 'humidity' ? 'nav-active text-white font-semibold' : 'text-[#a0aec0] hover:text-white hover:bg-white/5'}`}>
              Humidity
            </button>
            <button onClick={() => setMetric('both')}
              className={`px-5 py-2.5 text-sm rounded-xl transition-all ${metric === 'both' ? 'nav-active text-white font-semibold' : 'text-[#a0aec0] hover:text-white hover:bg-white/5'}`}>
              Both
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={exportCSV} disabled={isExporting || (isCustom && !isCustomValid && !deploymentFilter)}
              className="btn-glass px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </button>
            {exportError && <span className="text-sm text-[#ffb547]">{exportError}</span>}
          </div>
        </div>

        {deploymentFilter && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-[#0075ff]/20 border border-[#0075ff]/30 inline-flex items-center gap-2">
            <span className="text-sm text-white">
              Showing: {deployments.find(d => d.id.toString() === deploymentFilter)?.name}
            </span>
            <button onClick={() => setDeploymentFilter('')} className="text-[#a0aec0] hover:text-white">✕</button>
          </div>
        )}

        <div className="glass-card p-8">
          {isLoading ? (
            <div className="h-[500px] flex flex-col items-center justify-center">
              <div className="flex gap-1 mb-3">
                <span className="w-2 h-2 bg-[#a0aec0] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-[#a0aec0] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-[#a0aec0] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
              <p className="text-sm text-[#a0aec0]">Loading chart data...</p>
            </div>
          ) : !hasData ? (
            <div className="h-[500px] flex items-center justify-center fade-in">
              <div className="text-center">
                <p className="text-xl text-[#a0aec0] font-medium">No data available</p>
                <p className="text-sm text-[#a0aec0]/60 mt-2">Data will appear once sensors start reporting</p>
              </div>
            </div>
          ) : (
            <div className="h-[500px] fade-in">
              <ResponsiveLine
                data={chartData}
                margin={{ top: 30, right: metric === 'both' ? 70 : 30, bottom: 60, left: 70 }}
                xScale={{ type: 'time' }}
                yScale={{ type: 'linear', min: 'auto', max: 'auto', stacked: false }}
                axisBottom={{ format: '%H:%M', tickRotation: -45, legend: 'Time', legendOffset: 50, legendPosition: 'middle' }}
                axisLeft={{
                  legend: metric === 'both' ? '°F (Temp)' : metric === 'temperature' ? '°F' : '%',
                  legendOffset: -55,
                  legendPosition: 'middle'
                }}
                axisRight={metric === 'both' ? {
                  legend: '% (Humidity)',
                  legendOffset: 55,
                  legendPosition: 'middle',
                  format: (v) => {
                    // Convert normalized value back to humidity
                    if (tempMax === tempMin) return humidityMin.toFixed(0);
                    const h = humidityMin + ((Number(v) - tempMin) / (tempMax - tempMin)) * (humidityMax - humidityMin);
                    return h.toFixed(0);
                  },
                } : undefined}
                colors={({ id }) => {
                  const colorMap: Record<string, string> = {
                    'Node 1': '#0075ff',
                    'Node 2': '#01b574',
                    'Node 1 Temp': '#0075ff',
                    'Node 1 Humidity': '#21d4fd',
                    'Node 2 Temp': '#01b574',
                    'Node 2 Humidity': '#05cd99',
                  };
                  return colorMap[id as string] || '#0075ff';
                }}
                lineWidth={3}
                pointSize={6}
                pointColor="#0a0a0a"
                pointBorderWidth={2}
                pointBorderColor={{ from: 'seriesColor' }}
                enableArea={metric !== 'both'}
                areaBaselineValue={chartYMin}
                areaOpacity={0.1}
                enableSlices="x"
                sliceTooltip={({ slice }) => (
                  <div className="glass-card px-4 py-3 !rounded-xl">
                    <p className="text-xs text-[#a0aec0] mb-2">
                      {slice.points[0]?.data.x instanceof Date ? slice.points[0].data.x.toLocaleString() : ''}
                    </p>
                    {slice.points.map((point) => {
                      const data = point.data as { rawValue?: number; unit?: string; y: number };
                      const value = data.rawValue ?? data.y;
                      const unit = data.unit ?? (metric === 'temperature' ? '°F' : '%');
                      return (
                        <div key={point.id} className="flex items-center gap-2 text-sm">
                          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: point.seriesColor }} />
                          <span className="font-semibold text-white">{point.seriesId}:</span>
                          <span className="text-[#a0aec0]">
                            {typeof value === 'number' ? value.toFixed(1) : String(value)}{unit}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                legends={[{
                  anchor: 'top-right',
                  direction: 'row',
                  translateY: -25,
                  itemWidth: metric === 'both' ? 110 : 80,
                  itemHeight: 20,
                  symbolSize: 12,
                  symbolShape: 'circle',
                  itemTextColor: '#a0aec0'
                }]}
                theme={{
                  axis: { ticks: { text: { fill: '#a0aec0', fontSize: 12 } }, legend: { text: { fill: '#a0aec0', fontSize: 13, fontWeight: 600 } } },
                  grid: { line: { stroke: 'rgba(255,255,255,0.05)' } },
                  crosshair: { line: { stroke: '#a0aec0', strokeWidth: 1, strokeOpacity: 0.5 } },
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
    </AuthGate>
  );
}
