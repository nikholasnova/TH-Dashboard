'use client';

import { useEffect, useState, useCallback, useMemo, useRef, memo } from 'react';
import dynamic from 'next/dynamic';
import { PageLayout } from '@/components/PageLayout';
import {
  ChartSample,
  getChartSamples,
  celsiusToFahrenheit,
} from '@/lib/supabase';
import { useGuest } from '@/contexts/GuestContext';
import { guestGetChartSamples } from '@/lib/supabase/guestQueries';
import { useSetChatPageContext } from '@/lib/chatContext';
import { DEPLOYMENT_ALL_TIME_HOURS, DEPLOYMENT_ALL_TIME_LABEL, TIME_RANGES } from '@/lib/constants';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { FilterToolbar } from '@/components/FilterToolbar';
import { useTimeRange } from '@/hooks/useTimeRange';
import { useDeployments } from '@/hooks/useDeployments';
import { useDevices } from '@/contexts/DevicesContext';
import { ExportModal } from '@/components/ExportModal';
import { svgContainerToPng } from '@/lib/exportChart';
import { resolveDeviceColor, humidityVariant } from '@/lib/deviceColors';
import { SegmentedNav } from '@/components/SegmentedNav';

const ResponsiveLine = dynamic(
  () => import('@nivo/line').then((m) => m.ResponsiveLine),
  { ssr: false }
);

type MetricType = 'temperature' | 'humidity' | 'both';

type ChartPoint = {
  x: Date;
  y: number;
  rawValue?: number;
  unit?: string;
};

interface ChartSeries {
  id: string;
  label: string;
  color: string;
  data: ChartPoint[];
}

interface NivoChartProps {
  chartData: ChartSeries[];
  metric: MetricType;
  isMobile: boolean;
  chartYMin: number;
  tempMin: number;
  tempMax: number;
  humidityMin: number;
  humidityMax: number;
}

const NivoChart = memo(function NivoChart({
  chartData, metric, isMobile, chartYMin,
  tempMin, tempMax, humidityMin, humidityMax,
}: NivoChartProps) {
  return (
    <ResponsiveLine
      data={chartData}
      margin={isMobile
        ? { top: 20, right: metric === 'both' ? 50 : 12, bottom: 44, left: 40 }
        : { top: 30, right: metric === 'both' ? 70 : 30, bottom: 60, left: 70 }
      }
      xScale={{ type: 'time' }}
      yScale={{ type: 'linear', min: 'auto', max: 'auto', stacked: false }}
      axisBottom={{ format: '%H:%M', tickRotation: -45, legend: isMobile ? undefined : 'Time', legendOffset: 50, legendPosition: 'middle' }}
      axisLeft={{
        legend: isMobile ? undefined : (metric === 'both' ? '°F (Temp)' : metric === 'temperature' ? '°F' : '%'),
        legendOffset: -55,
        legendPosition: 'middle'
      }}
      axisRight={metric === 'both' ? {
        legend: isMobile ? undefined : '% (Humidity)',
        legendOffset: 55,
        legendPosition: 'middle',
        format: (v) => {
          if (tempMax === tempMin) return humidityMin.toFixed(0);
          const h = humidityMin + ((Number(v) - tempMin) / (tempMax - tempMin)) * (humidityMax - humidityMin);
          return h.toFixed(0);
        },
      } : undefined}
      colors={({ id }) => {
        const series = chartData.find(s => s.id === id);
        return series?.color || 'var(--chart-line)';
      }}
      lineWidth={isMobile ? 2 : 3}
      pointSize={isMobile ? 4 : 6}
      pointColor="var(--background-main)"
      pointBorderWidth={2}
      pointBorderColor={{ from: 'seriesColor' }}
      enableArea={metric !== 'both'}
      areaBaselineValue={chartYMin}
      areaOpacity={0.1}
      motionConfig={{ mass: 1, tension: 300, friction: 40 }}
      enableSlices="x"
      sliceTooltip={({ slice }) => (
        <div className="glass-card px-4 py-3 !rounded-xl">
          <p className="text-xs text-[var(--foreground-muted)] mb-2">
            {slice.points[0]?.data.x instanceof Date ? slice.points[0].data.x.toLocaleString() : ''}
          </p>
          {slice.points.map((point) => {
            const data = point.data as { rawValue?: number; unit?: string; y: number };
            const value = data.rawValue ?? data.y;
            const unit = data.unit ?? (metric === 'temperature' ? '°F' : '%');
            return (
              <div key={point.id} className="flex items-center gap-2 text-sm">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: point.seriesColor }} />
                <span className="font-semibold text-[var(--foreground)]">{chartData.find(s => s.id === point.seriesId)?.label ?? point.seriesId}:</span>
                <span className="text-[var(--foreground-muted)]">
                  {typeof value === 'number' ? value.toFixed(1) : String(value)}{unit}
                </span>
              </div>
            );
          })}
        </div>
      )}
      legends={isMobile ? [] : [{
        anchor: 'top-right',
        direction: 'row',
        translateY: -25,
        itemWidth: metric === 'both' ? 110 : 80,
        itemHeight: 20,
        symbolSize: 12,
        symbolShape: 'circle',
        itemTextColor: 'var(--chart-text)',
        data: chartData.map(s => ({ id: s.id, label: s.label ?? s.id, color: s.color })),
      }]}
      theme={{
        axis: { ticks: { text: { fill: 'var(--chart-text)', fontSize: isMobile ? 10 : 12 } }, legend: { text: { fill: 'var(--chart-text)', fontSize: isMobile ? 11 : 13, fontWeight: 600 } } },
        grid: { line: { stroke: 'var(--chart-grid)' } },
        crosshair: { line: { stroke: 'var(--chart-text)', strokeWidth: 1, strokeOpacity: 0.5 } },
      }}
    />
  );
});


export default function ChartsPage() {
  const [samples, setSamples] = useState<ChartSample[]>([]);
  const [metric, setMetric] = useState<MetricType>('temperature');
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const { devices } = useDevices();
  const { isGuest } = useGuest();
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

  const pickBucketSeconds = (rangeMs: number) => {
    const rangeSeconds = rangeMs / 1000;
    const targetPoints = 100;
    const idealBucketSeconds = rangeSeconds / targetPoints;
    const bucketOptions = [300, 600, 900, 1800, 3600, 7200, 10800, 14400, 21600, 43200, 86400];
    return bucketOptions.find((bucket) => bucket >= idealBucketSeconds) || bucketOptions[bucketOptions.length - 1];
  };

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const hasDataRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (isCustom && !isCustomValid) return;
    if (!hasDataRef.current) setIsLoading(true);
    setIsFetching(true);
    try {
      const { start, end, scopedDeviceId } = await getRangeBounds();
      const rangeMs = new Date(end).getTime() - new Date(start).getTime();
      const bucketSeconds = pickBucketSeconds(rangeMs);
      const fetchSamples = isGuest ? guestGetChartSamples : getChartSamples;
      const data = await fetchSamples({
        start,
        end,
        bucketSeconds,
        device_id: scopedDeviceId,
      });
      setSamples(data);
      hasDataRef.current = data.length > 0;
    } finally {
      setIsLoading(false);
      setIsFetching(false);
    }
  }, [getRangeBounds, isCustom, isCustomValid, isGuest]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const toDatetimeLocal = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const exportDefaults = useMemo(() => {
    if (isCustom && customStart && customEnd) {
      return { start: customStart, end: customEnd };
    }
    const now = new Date();
    const hoursAgo = selectedRange > 0 ? selectedRange : 24;
    return { start: toDatetimeLocal(new Date(now.getTime() - hoursAgo * 3600000)), end: toDatetimeLocal(now) };
  }, [isCustom, customStart, customEnd, selectedRange]);

  const isFiniteNumber = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);

  const { chartData, hasData, chartYMin, tempMin, tempMax, humidityMin, humidityMax } = useMemo(() => {
    const validSamples = samples.filter((sample) => {
      const ts = new Date(sample.bucket_ts);
      return (
        !Number.isNaN(ts.getTime()) &&
        isFiniteNumber(sample.temperature_avg) &&
        isFiniteNumber(sample.humidity_avg)
      );
    });

    const tempValues = validSamples.map((r) => celsiusToFahrenheit(r.temperature_avg));
    const tempMin = tempValues.length > 0 ? Math.min(...tempValues) : 0;
    const tempMax = tempValues.length > 0 ? Math.max(...tempValues) : 100;
    const humidityValues = validSamples.map((r) => r.humidity_avg);
    const humidityMin = humidityValues.length > 0 ? Math.min(...humidityValues) : 0;
    const humidityMax = humidityValues.length > 0 ? Math.max(...humidityValues) : 100;

    const normalizeHumidity = (h: number) => {
      if (humidityMax === humidityMin) return tempMin;
      return tempMin + ((h - humidityMin) / (humidityMax - humidityMin)) * (tempMax - tempMin);
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

    const activeDevices = deviceFilter
      ? devices.filter(d => d.id === deviceFilter)
      : devices;

    let series;
    if (metric === 'both') {
      series = activeDevices.flatMap(device => {
        const deviceSamples = validSamples.filter(r => r.device_id === device.id);
        const baseColor = resolveDeviceColor(device);
        return [
          {
            id: `${device.id}:temp`,
            label: `${device.display_name} Temp`,
            color: baseColor,
            data: compactPoints(deviceSamples.map(r => {
              const tempF = celsiusToFahrenheit(r.temperature_avg);
              return makePoint(r.bucket_ts, tempF, { rawValue: tempF, unit: '°F' });
            })),
          },
          {
            id: `${device.id}:humidity`,
            label: `${device.display_name} Humidity`,
            color: humidityVariant(baseColor),
            data: compactPoints(deviceSamples.map(r =>
              makePoint(r.bucket_ts, normalizeHumidity(r.humidity_avg), { rawValue: r.humidity_avg, unit: '%' })
            )),
          },
        ];
      });
    } else {
      series = activeDevices.map(device => ({
        id: device.id,
        label: device.display_name,
        color: resolveDeviceColor(device),
        data: compactPoints(
          validSamples
            .filter(r => r.device_id === device.id)
            .map(r => makePoint(
              r.bucket_ts,
              metric === 'temperature' ? celsiusToFahrenheit(r.temperature_avg) : r.humidity_avg
            ))
        ),
      }));
    }

    const data = series.filter((s) => s.data.length > 0);
    const has = data.some((s) => s.data.length > 0);
    const yMin = has
      ? Math.min(...data.flatMap(s => s.data.map(d => d.y as number)))
      : 0;

    return { chartData: data, hasData: has, chartYMin: yMin, tempMin, tempMax, humidityMin, humidityMax };
  }, [samples, metric, devices, deviceFilter]);

  return (
    <PageLayout title="Charts">
        <FilterToolbar timeRange={timeRange} deployments={deployments}>
          <SegmentedNav
            layoutGroupId="chart-metric"
            value={metric}
            onChange={(v) => setMetric(v as MetricType)}
            options={[
              { value: 'temperature', label: 'Temp' },
              { value: 'humidity', label: 'Humidity' },
              { value: 'both', label: 'Both' },
            ]}
          />

          <button
            onClick={() => setIsExportModalOpen(true)}
            className="h-14 px-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--fg)] border border-[var(--hairline-strong)] rounded-md hover:bg-[var(--hover-bg)] transition-colors sm:ml-auto w-full sm:w-auto"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
        </FilterToolbar>

        {deploymentFilter && (
          <div className="mb-4 px-4 py-2 rounded-lg bg-[var(--active-bg)] border border-[var(--divider)] inline-flex items-center gap-2">
            <span className="text-sm text-[var(--foreground)]">
              Showing: {deployments.find(d => d.id.toString() === deploymentFilter)?.name}
            </span>
            <button onClick={() => timeRange.setDeploymentFilter('')} className="text-[var(--foreground-muted)] hover:text-[var(--foreground)]" aria-label="Clear deployment filter">✕</button>
          </div>
        )}

        {hasData && !isLoading && (
          <div className="flex justify-end mb-2">
            <button
              onClick={() => {
                if (!chartContainerRef.current) return;
                const rangeLabel = selectedRange === -1 ? 'custom' : String(selectedRange);
                svgContainerToPng(chartContainerRef.current, `chart-${metric}-${rangeLabel}-${new Date().toISOString().slice(0, 10)}.png`);
              }}
              className="inline-flex items-center gap-2 text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors px-2 py-1"
              title="Download chart as PNG"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Save PNG
            </button>
          </div>
        )}
        <div className="pt-6 border-t border-[var(--hairline)]" ref={chartContainerRef}>
          {isLoading ? (
            <div className="h-[360px] sm:h-[500px]">
              <LoadingSpinner message="Loading chart data..." className="h-full" />
            </div>
          ) : !hasData ? (
            <div className="h-[360px] sm:h-[500px] flex items-center justify-center fade-in">
              <div>
                <p className="text-base text-[var(--fg-dim)]">No readings in this window.</p>
                <p className="text-xs text-[var(--fg-muted)] mt-1">Try a wider time range.</p>
              </div>
            </div>
          ) : (
            <div className={`h-[360px] sm:h-[500px] transition-opacity duration-150 ${isFetching ? 'opacity-40' : 'opacity-100'}`}>
              <NivoChart
                chartData={chartData}
                metric={metric}
                isMobile={isMobile}
                chartYMin={chartYMin}
                tempMin={tempMin}
                tempMax={tempMax}
                humidityMin={humidityMin}
                humidityMax={humidityMax}
              />
            </div>
          )}
          {isMobile && hasData && chartData.length > 1 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1 sm:hidden">
              {chartData.map(s => (
                <div key={s.id} className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-[var(--foreground-muted)]">{s.label ?? s.id}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <ExportModal
          isOpen={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          defaultStart={exportDefaults.start}
          defaultEnd={exportDefaults.end}
          defaultDeviceId={deviceFilter}
        />
    </PageLayout>
  );
}
