'use client';

import { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { PageLayout } from '@/components/PageLayout';
import {
  ChartSample,
  getAllReadings,
  getAllReadingsRange,
  getChartSamples,
  celsiusToFahrenheit,
} from '@/lib/supabase';
import { useSetChatPageContext } from '@/lib/chatContext';
import { DEPLOYMENT_ALL_TIME_HOURS, DEPLOYMENT_ALL_TIME_LABEL, TIME_RANGES } from '@/lib/constants';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { FilterToolbar } from '@/components/FilterToolbar';
import { useTimeRange } from '@/hooks/useTimeRange';
import { useDeployments } from '@/hooks/useDeployments';
import { useDevices } from '@/contexts/DevicesContext';

const ResponsiveLine = dynamic(
  () => import('@nivo/line').then((m) => m.ResponsiveLine),
  { ssr: false }
);

type MetricType = 'temperature' | 'humidity' | 'both';

function lightenColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lighten = (v: number) => Math.min(255, v + 60);
  return `#${lighten(r).toString(16).padStart(2, '0')}${lighten(g).toString(16).padStart(2, '0')}${lighten(b).toString(16).padStart(2, '0')}`;
}

export default function ChartsPage() {
  const [samples, setSamples] = useState<ChartSample[]>([]);
  const [metric, setMetric] = useState<MetricType>('temperature');
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const { devices } = useDevices();
  const timeRange = useTimeRange();
  const { deployments } = useDeployments(timeRange.deviceFilter);
  const {
    selectedRange, isCustom, isCustomValid,
    deploymentFilter, deviceFilter,
    customStart, customEnd,
    getRangeBounds,
  } = timeRange;

  const setPageContext = useSetChatPageContext();
  useEffect(() => {
    const rangeLabel =
      selectedRange === DEPLOYMENT_ALL_TIME_HOURS
        ? DEPLOYMENT_ALL_TIME_LABEL
        : (TIME_RANGES.find(r => r.hours === selectedRange)?.label || `${selectedRange}h`);

    setPageContext({
      page: 'charts',
      timeRange: rangeLabel,
      deviceFilter: deviceFilter || undefined,
      deploymentId: deploymentFilter ? parseInt(deploymentFilter, 10) : undefined,
      customStart: selectedRange === -1 ? customStart : undefined,
      customEnd: selectedRange === -1 ? customEnd : undefined,
    });
    return () => setPageContext({});
  }, [setPageContext, selectedRange, deviceFilter, deploymentFilter, customStart, customEnd]);

  // Clear export error when any filter changes
  useEffect(() => {
    setExportError(null);
  }, [selectedRange, customStart, customEnd, deviceFilter, deploymentFilter]);

  const pickBucketSeconds = (rangeMs: number) => {
    const rangeHours = rangeMs / 3_600_000;
    if (rangeHours >= 24) return 1800;
    const rangeSeconds = rangeMs / 1000;
    const targetPoints = 1200;
    const idealBucketSeconds = rangeSeconds / targetPoints;
    const bucketOptions = [300, 600, 900, 1800, 3600, 7200, 10800, 14400, 21600, 43200, 86400];
    return bucketOptions.find((bucket) => bucket >= idealBucketSeconds) || bucketOptions[bucketOptions.length - 1];
  };

  const fetchData = useCallback(async () => {
    if (isCustom && !isCustomValid) return;
    setIsLoading(true);
    try {
      const { start, end, scopedDeviceId } = await getRangeBounds();
      const rangeMs = new Date(end).getTime() - new Date(start).getTime();
      const bucketSeconds = pickBucketSeconds(rangeMs);
      const data = await getChartSamples({
        start,
        end,
        bucketSeconds,
        device_id: scopedDeviceId,
      });
      setSamples(data);
    } finally {
      setIsLoading(false);
    }
  }, [getRangeBounds, isCustom, isCustomValid]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchData();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const exportCSV = async () => {
    if (isCustom && !isCustomValid) return;
    setIsExporting(true);
    setExportError(null);

    const { start, end, scopedDeviceId } = await getRangeBounds();
    let rawReadings = isCustom || deploymentFilter
      ? await getAllReadingsRange({ start, end })
      : await getAllReadings(selectedRange);

    if (scopedDeviceId) {
      rawReadings = rawReadings.filter(r => r.device_id === scopedDeviceId);
    }
    rawReadings = rawReadings.filter(r => !r.device_id.startsWith('weather_'));

    if (rawReadings.length === 0) {
      setExportError('No data to export');
      setIsExporting(false);
      return;
    }

    const csvSafe = (value: string): string => {
      if (/[,"\n\r]/.test(value) || /^[=+\-@\t\r]/.test(value)) {
        return `"${value.replace(/"/g, '""')}"`;
      }
      return value;
    };

    const headers = ['timestamp', 'device_id', 'temperature_f', 'temperature_c', 'humidity'];
    const rows = rawReadings.map((r) => [
      csvSafe(r.created_at),
      csvSafe(r.device_id),
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

  const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

  // Guard Nivo from invalid points (NaN/null dates or values) which can produce d="null" path errors.
  const validSamples = samples.filter((sample) => {
    const ts = new Date(sample.bucket_ts);
    return (
      !Number.isNaN(ts.getTime()) &&
      isFiniteNumber(sample.temperature_avg) &&
      isFiniteNumber(sample.humidity_avg)
    );
  });

  // Calculate temp range for normalizing humidity in "both" mode
  const tempValues = validSamples.map((r) => celsiusToFahrenheit(r.temperature_avg));
  const tempMin = tempValues.length > 0 ? Math.min(...tempValues) : 0;
  const tempMax = tempValues.length > 0 ? Math.max(...tempValues) : 100;
  const humidityValues = validSamples.map((r) => r.humidity_avg);
  const humidityMin = humidityValues.length > 0 ? Math.min(...humidityValues) : 0;
  const humidityMax = humidityValues.length > 0 ? Math.max(...humidityValues) : 100;

  // Normalize humidity to temperature scale for dual-axis display
  const normalizeHumidity = (h: number) => {
    if (humidityMax === humidityMin) return tempMin;
    return tempMin + ((h - humidityMin) / (humidityMax - humidityMin)) * (tempMax - tempMin);
  };

  type ChartPoint = {
    x: Date;
    y: number;
    rawValue?: number;
    unit?: string;
  };

  const compactPoints = (points: Array<ChartPoint | null>): ChartPoint[] =>
    points.filter((point): point is ChartPoint => point !== null);

  const makePoint = (
    bucketTs: string,
    y: number,
    extras?: { rawValue?: number; unit?: string }
  ): ChartPoint | null => {
    const x = new Date(bucketTs);
    if (Number.isNaN(x.getTime()) || !Number.isFinite(y)) return null;
    return { x, y, ...extras };
  };

  const buildChartData = () => {
    const activeDevices = deviceFilter
      ? devices.filter(d => d.id === deviceFilter)
      : devices;

    if (metric === 'both') {
      return activeDevices.flatMap(device => {
        const deviceSamples = validSamples.filter(r => r.device_id === device.id);
        return [
          {
            id: `${device.id}:temp`,
            label: `${device.display_name} Temp`,
            color: device.color,
            data: compactPoints(deviceSamples.map(r => {
              const tempF = celsiusToFahrenheit(r.temperature_avg);
              return makePoint(r.bucket_ts, tempF, { rawValue: tempF, unit: '°F' });
            })),
          },
          {
            id: `${device.id}:humidity`,
            label: `${device.display_name} Humidity`,
            color: lightenColor(device.color),
            data: compactPoints(deviceSamples.map(r =>
              makePoint(r.bucket_ts, normalizeHumidity(r.humidity_avg), { rawValue: r.humidity_avg, unit: '%' })
            )),
          },
        ];
      });
    }

    return activeDevices.map(device => ({
      id: device.id,
      label: device.display_name,
      color: device.color,
      data: compactPoints(
        validSamples
          .filter(r => r.device_id === device.id)
          .map(r => makePoint(
            r.bucket_ts,
            metric === 'temperature' ? celsiusToFahrenheit(r.temperature_avg) : r.humidity_avg
          ))
      ),
    }));
  };

  const chartData = buildChartData().filter((series) => series.data.length > 0);
  const hasData = chartData.some((series) => series.data.length > 0);

  // Compute area baseline from actual chart data so the fill doesn't extend below the chart
  const chartYMin = hasData
    ? Math.min(...chartData.flatMap(s => s.data.map(d => d.y as number)))
    : 0;

  return (
    <PageLayout title="Charts" subtitle="Historical data visualization">
        <FilterToolbar timeRange={timeRange} deployments={deployments}>
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
            <button onClick={exportCSV} disabled={isExporting || (isCustom && !isCustomValid)}
              className="btn-glass px-5 py-2.5 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
              {isExporting ? 'Exporting...' : 'Export CSV'}
            </button>
            {exportError && <span className="text-sm text-[#ffb547]">{exportError}</span>}
          </div>
        </FilterToolbar>

        {deploymentFilter && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-[#0075ff]/20 border border-[#0075ff]/30 inline-flex items-center gap-2">
            <span className="text-sm text-white">
              Showing: {deployments.find(d => d.id.toString() === deploymentFilter)?.name}
            </span>
            <button onClick={() => timeRange.setDeploymentFilter('')} className="text-[#a0aec0] hover:text-white">✕</button>
          </div>
        )}

        <div className="glass-card p-8">
          {isLoading ? (
            <div className="h-[500px]">
              <LoadingSpinner message="Loading chart data..." className="h-full" />
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
                  const series = chartData.find(s => s.id === id);
                  return series?.color || '#0075ff';
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
                          <span className="font-semibold text-white">{chartData.find(s => s.id === point.seriesId)?.label ?? point.seriesId}:</span>
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
                  itemTextColor: '#a0aec0',
                  data: chartData.map(s => ({ id: s.id, label: s.label ?? s.id, color: s.color })),
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
    </PageLayout>
  );
}
