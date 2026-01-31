'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
  ChartSample,
  getAllReadings,
  getAllReadingsRange,
  getChartSamples,
  celsiusToFahrenheit,
} from '@/lib/supabase';

// Dynamic import for Nivo (client-only)
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

type MetricType = 'temperature' | 'humidity';

export default function ChartsPage() {
  const [samples, setSamples] = useState<ChartSample[]>([]);
  const [selectedRange, setSelectedRange] = useState(24);
  const [metric, setMetric] = useState<MetricType>('temperature');
  const [isLoading, setIsLoading] = useState(true);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const isCustom = selectedRange === -1;
  const isCustomValid =
    !!customStart &&
    !!customEnd &&
    new Date(customStart).getTime() < new Date(customEnd).getTime();

  const getRangeBounds = () => {
    if (isCustom) {
      return {
        start: new Date(customStart).toISOString(),
        end: new Date(customEnd).toISOString(),
      };
    }
    const end = new Date();
    const start = new Date(end.getTime() - selectedRange * 60 * 60 * 1000);
    return { start: start.toISOString(), end: end.toISOString() };
  };

  const pickBucketSeconds = (rangeMs: number) => {
    const minutes = rangeMs / 60000;
    if (minutes <= 360) return 30;     // <= 6h
    if (minutes <= 1440) return 120;   // <= 24h
    if (minutes <= 10080) return 900;  // <= 7d
    return 3600;
  };

  const fetchData = useCallback(async () => {
    if (isCustom && !isCustomValid) return;
    setIsLoading(true);
    const { start, end } = getRangeBounds();
    const rangeMs = new Date(end).getTime() - new Date(start).getTime();
    const bucketSeconds = pickBucketSeconds(rangeMs);
    const data = await getChartSamples({ start, end, bucketSeconds });
    setSamples(data);
    setIsLoading(false);
  }, [selectedRange, isCustom, isCustomValid, customStart, customEnd]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Clear export error when range changes
  useEffect(() => {
    setExportError(null);
  }, [selectedRange, customStart, customEnd]);

  // Export data as CSV
  const exportCSV = async () => {
    if (isCustom && !isCustomValid) return;
    setIsExporting(true);
    setExportError(null);

    const { start, end } = getRangeBounds();
    const rawReadings = isCustom
      ? await getAllReadingsRange({ start, end })
      : await getAllReadings(selectedRange);

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
    const label = isCustom ? 'custom' : `${selectedRange}h`;
    a.download = `readings-${label}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setIsExporting(false);
  };

  // Transform data for Nivo
  const chartData = [
    {
      id: 'Node 1',
      color: '#0075ff',
      data: samples
        .filter((r) => r.device_id === 'node1')
        .map((r) => ({
          x: new Date(r.bucket_ts),
          y: metric === 'temperature'
            ? celsiusToFahrenheit(r.temperature_avg)
            : r.humidity_avg,
        })),
    },
    {
      id: 'Node 2',
      color: '#01b574',
      data: samples
        .filter((r) => r.device_id === 'node2')
        .map((r) => ({
          x: new Date(r.bucket_ts),
          y: metric === 'temperature'
            ? celsiusToFahrenheit(r.temperature_avg)
            : r.humidity_avg,
        })),
    },
  ];

  const hasData = chartData.some((series) => series.data.length > 0);

  return (
    <div className="min-h-screen">
      <div className="container-responsive">
        {/* Header */}
        <header className="mb-10">
          <h1 className="text-4xl font-bold text-white mb-2">
            Charts
          </h1>
          <p className="text-lg text-[#a0aec0]">Historical data visualization</p>
        </header>

        {/* Navigation */}
        <nav className="glass-card p-2 mb-10 inline-flex gap-2">
          <Link
            href="/"
            className="px-6 py-3 text-[#a0aec0] hover:text-white rounded-xl text-sm font-medium transition-colors"
          >
            Live
          </Link>
          <Link
            href="/charts"
            className="nav-active px-6 py-3 text-white text-sm font-semibold"
          >
            Charts
          </Link>
          <Link
            href="/compare"
            className="px-6 py-3 text-[#a0aec0] hover:text-white rounded-xl text-sm font-medium transition-colors"
          >
            Compare
          </Link>
        </nav>

        {/* Controls */}
        <div className="flex flex-wrap gap-4 mb-8">
          {/* Time Range */}
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

          {isCustom && (
            <div className="glass-card p-3 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#a0aec0]">Start</label>
                <input
                  type="datetime-local"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-xs text-[#a0aec0]">End</label>
                <input
                  type="datetime-local"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
                />
              </div>
              {!isCustomValid && (
                <span className="text-xs text-[#ffb547]">Pick a valid range</span>
              )}
            </div>
          )}

          {/* Metric Toggle */}
          <div className="glass-card p-2 flex gap-1">
            <button
              onClick={() => setMetric('temperature')}
              className={`px-5 py-2.5 text-sm rounded-xl transition-all ${
                metric === 'temperature'
                  ? 'nav-active text-white font-semibold'
                  : 'text-[#a0aec0] hover:text-white hover:bg-white/5'
              }`}
            >
              Temperature
            </button>
            <button
              onClick={() => setMetric('humidity')}
              className={`px-5 py-2.5 text-sm rounded-xl transition-all ${
                metric === 'humidity'
                  ? 'nav-active text-white font-semibold'
                  : 'text-[#a0aec0] hover:text-white hover:bg-white/5'
              }`}
            >
              Humidity
            </button>
          </div>

          {/* Export */}
          <div className="flex items-center gap-3">
            <button
              onClick={exportCSV}
              disabled={isExporting || (isCustom && !isCustomValid)}
              className="btn-glass px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </button>
            {exportError && (
              <span className="text-sm text-[#ffb547]">{exportError}</span>
            )}
          </div>
        </div>

        {/* Chart */}
        <div className="glass-card p-8">
          {isLoading ? (
            <div className="h-[500px] flex flex-col">
              <div className="flex justify-end mb-4">
                <div className="flex gap-4">
                  <div className="skeleton h-4 w-16 rounded-full"></div>
                  <div className="skeleton h-4 w-16 rounded-full"></div>
                </div>
              </div>
              <div className="flex-1 flex items-end gap-1 pb-12 pl-12">
                {Array.from({ length: 24 }).map((_, i) => (
                  <div
                    key={i}
                    className="skeleton flex-1 rounded-t"
                    style={{ height: `${30 + Math.sin(i * 0.5) * 20 + Math.random() * 30}%` }}
                  ></div>
                ))}
              </div>
            </div>
          ) : !hasData ? (
            <div className="h-[500px] flex items-center justify-center fade-in">
              <div className="text-center">
                <p className="text-xl text-[#a0aec0] font-medium">No data available</p>
                <p className="text-sm text-[#a0aec0]/60 mt-2">
                  Data will appear once sensors start reporting
                </p>
              </div>
            </div>
          ) : (
            <div className="h-[500px] fade-in">
              <ResponsiveLine
                data={chartData}
                margin={{ top: 30, right: 30, bottom: 60, left: 70 }}
                xScale={{ type: 'time' }}
                yScale={{
                  type: 'linear',
                  min: 'auto',
                  max: 'auto',
                  stacked: false,
                }}
                axisBottom={{
                  format: '%H:%M',
                  tickRotation: -45,
                  legend: 'Time',
                  legendOffset: 50,
                  legendPosition: 'middle',
                }}
                axisLeft={{
                  legend: metric === 'temperature' ? '°F' : '%',
                  legendOffset: -55,
                  legendPosition: 'middle',
                }}
                colors={['#0075ff', '#01b574']}
                lineWidth={3}
                pointSize={6}
                pointColor="#060b28"
                pointBorderWidth={2}
                pointBorderColor={{ from: 'serieColor' }}
                enableArea={true}
                areaOpacity={0.1}
                enableSlices="x"
                sliceTooltip={({ slice }) => (
                  <div className="glass-card px-4 py-3 !rounded-xl">
                    <p className="text-xs text-[#a0aec0] mb-2">
                      {slice.points[0]?.data.x instanceof Date
                        ? slice.points[0].data.x.toLocaleString()
                        : ''}
                    </p>
                    {slice.points.map((point) => (
                      <div
                        key={point.id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: point.seriesColor }}
                        />
                        <span className="font-semibold text-white">{point.seriesId}:</span>
                        <span className="text-[#a0aec0]">
                          {typeof point.data.y === 'number'
                            ? point.data.y.toFixed(1)
                            : String(point.data.y)}
                          {metric === 'temperature' ? '°F' : '%'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                legends={[
                  {
                    anchor: 'top-right',
                    direction: 'row',
                    translateY: -25,
                    itemWidth: 80,
                    itemHeight: 20,
                    symbolSize: 12,
                    symbolShape: 'circle',
                    itemTextColor: '#a0aec0',
                  },
                ]}
                theme={{
                  axis: {
                    ticks: {
                      text: { fill: '#a0aec0', fontSize: 12 },
                    },
                    legend: {
                      text: { fill: '#a0aec0', fontSize: 13, fontWeight: 600 },
                    },
                  },
                  grid: {
                    line: { stroke: 'rgba(255,255,255,0.05)' },
                  },
                  crosshair: {
                    line: {
                      stroke: '#a0aec0',
                      strokeWidth: 1,
                      strokeOpacity: 0.5,
                    },
                  },
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
