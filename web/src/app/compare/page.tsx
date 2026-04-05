'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { PageLayout } from '@/components/PageLayout';
import { DeviceStats, getDeviceStats, getDeployment } from '@/lib/supabase';
import { computePercentError, getScopedCompareDeviceIds } from '@/lib/weatherCompare';
import { formatValue, formatPercent, safeC2F, safeDeltaC2F } from '@/lib/format';
import { useDevices } from '@/contexts/DevicesContext';
import { useSetChatPageContext } from '@/lib/chatContext';
import { DEPLOYMENT_ALL_TIME_HOURS, DEPLOYMENT_ALL_TIME_LABEL, TIME_RANGES } from '@/lib/constants';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { FilterToolbar } from '@/components/FilterToolbar';
import { useTimeRange } from '@/hooks/useTimeRange';
import { useDeployments } from '@/hooks/useDeployments';

function formatDelta(values: (number | null | undefined)[], decimals = 1): string {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length < 2) return '—';
  if (valid.length === 2) {
    const diff = valid[0] - valid[1];
    const sign = diff >= 0 ? '+' : '';
    return `${sign}${diff.toFixed(decimals)}`;
  }
  const spread = Math.max(...valid) - Math.min(...valid);
  return `±${(spread / 2).toFixed(decimals)}`;
}

function formatDeltaPercent(values: (number | null | undefined)[]): string {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length < 2) return '—';
  if (valid.length === 2) {
    const diff = valid[0] - valid[1];
    const sign = diff >= 0 ? '+' : '';
    return `${sign}${diff.toFixed(1)}%`;
  }
  const spread = Math.max(...valid) - Math.min(...valid);
  return `±${(spread / 2).toFixed(1)}%`;
}

export default function ComparePage() {
  const [stats, setStats] = useState<DeviceStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const { devices } = useDevices();
  const timeRange = useTimeRange();
  const { deployments } = useDeployments(timeRange.deviceFilter);
  const {
    selectedRange, isCustom, isCustomValid,
    deploymentFilter, deviceFilter,
    getRangeBounds,
  } = timeRange;

  const setPageContext = useSetChatPageContext();
  useEffect(() => {
    const rangeLabel =
      selectedRange === DEPLOYMENT_ALL_TIME_HOURS
        ? DEPLOYMENT_ALL_TIME_LABEL
        : (TIME_RANGES.find(r => r.hours === selectedRange)?.label || `${selectedRange}h`);

    setPageContext({
      page: 'compare',
      timeRange: rangeLabel,
      deviceFilter: deviceFilter || undefined,
      deploymentId: deploymentFilter ? parseInt(deploymentFilter, 10) : undefined,
    });
    return () => setPageContext({});
  }, [setPageContext, selectedRange, deviceFilter, deploymentFilter]);

  const fetchData = useCallback(async () => {
    if (isCustom && !isCustomValid) return;
    setIsLoading(true);

    try {
      const { start, end } = await getRangeBounds();
      const fetchForDeviceIds = async (deviceIds: string[]) => {
        const uniqueIds = Array.from(new Set(deviceIds));
        const statsByDevice = await Promise.all(
          uniqueIds.map((deviceId) => getDeviceStats({ start, end, device_id: deviceId }))
        );
        return statsByDevice.flat();
      };

      if (deploymentFilter) {
        const dep = await getDeployment(parseInt(deploymentFilter, 10));
        if (!dep) {
          setStats([]);
        } else {
          const scoped = getScopedCompareDeviceIds({ deploymentDeviceId: dep.device_id });
          const data = scoped
            ? await fetchForDeviceIds(scoped)
            : await getDeviceStats({ start, end, device_id: dep.device_id });
          setStats(data);
        }
      } else {
        const scoped = getScopedCompareDeviceIds({ deviceFilter });
        const data = scoped
          ? await fetchForDeviceIds(scoped)
          : await getDeviceStats({ start, end, device_id: undefined });
        setStats(data);
      }
    } finally {
      setIsLoading(false);
    }
  }, [deploymentFilter, deviceFilter, getRangeBounds, isCustom, isCustomValid]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchData();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const activeDeployment = deploymentFilter ? deployments.find(d => d.id.toString() === deploymentFilter) : null;

  const statsByDevice = useMemo(() => {
    const map: Record<string, DeviceStats | null> = {};
    for (const device of devices) {
      map[device.id] = null;
      map[`weather_${device.id}`] = null;
    }
    for (const row of stats) {
      if (row.device_id in map) map[row.device_id] = row;
    }
    return map;
  }, [stats, devices]);

  const deviceColumns = useMemo(() => devices.map(device => {
    const sensor = statsByDevice[device.id];
    const weather = statsByDevice[`weather_${device.id}`];
    const tempAvgF = safeC2F(sensor?.temp_avg);
    const weatherTempAvgF = safeC2F(weather?.temp_avg);
    return {
      device,
      sensor,
      weather,
      tempAvgF,
      tempMinF: safeC2F(sensor?.temp_min),
      tempMaxF: safeC2F(sensor?.temp_max),
      tempStdF: safeDeltaC2F(sensor?.temp_stddev),
      weatherTempAvgF,
      tempErrorPct: computePercentError(tempAvgF, weatherTempAvgF),
      humidityErrorPct: computePercentError(sensor?.humidity_avg, weather?.humidity_avg),
    };
  }), [devices, statsByDevice]);

  return (
    <PageLayout title="Compare" subtitle="Side-by-side sensor statistics">
        <FilterToolbar timeRange={timeRange} deployments={deployments} />

        {deploymentFilter && activeDeployment && (
          <div className="mb-6 px-4 py-2 rounded-lg bg-[var(--active-bg)] border border-[var(--divider)] inline-flex items-center gap-2">
            <span className="text-sm text-[var(--foreground)]">
              Showing: {activeDeployment.name} ({activeDeployment.location})
            </span>
            <button onClick={() => timeRange.setDeploymentFilter('')} className="text-[var(--foreground-muted)] hover:text-[var(--foreground)]">✕</button>
          </div>
        )}

        {isLoading ? (
          <>
            <div className="glass-card card-stats p-8 mb-8">
              <h2 className="text-2xl font-bold text-[var(--foreground)] mb-6">Temperature (°F)</h2>
              <LoadingSpinner message="Loading stats..." />
            </div>
            <div className="glass-card card-stats p-8">
              <h2 className="text-2xl font-bold text-[var(--foreground)] mb-6">Humidity (%)</h2>
              <LoadingSpinner message="Loading stats..." />
            </div>
          </>
        ) : (
          <div className="fade-in">
            {/* Mobile: stacked cards per device */}
            <div className="sm:hidden space-y-4">
              {deviceColumns.map(col => (
                <div key={col.device.id} className="glass-card p-4">
                  <h3 className="text-base font-bold mb-3" style={{ color: col.device.color }}>
                    {col.device.display_name}
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg p-3 bg-[var(--hover-bg)]">
                      <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider mb-1">Avg Temp</p>
                      <p className="text-lg font-semibold text-[var(--foreground)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(col.tempAvgF)}°F</p>
                    </div>
                    <div className="rounded-lg p-3 bg-[var(--hover-bg)]">
                      <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider mb-1">Avg Humidity</p>
                      <p className="text-lg font-semibold text-[var(--foreground)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(col.sensor?.humidity_avg)}%</p>
                    </div>
                    <div className="rounded-lg p-3 bg-[var(--hover-bg)]">
                      <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider mb-1">High / Low</p>
                      <p className="text-sm font-semibold text-[var(--foreground)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <span className="text-[var(--warning)]">{formatValue(col.tempMaxF)}°</span>
                        {' / '}
                        <span className="text-[var(--info)]">{formatValue(col.tempMinF)}°</span>
                      </p>
                    </div>
                    <div className="rounded-lg p-3 bg-[var(--hover-bg)]">
                      <p className="text-[10px] text-[var(--foreground-muted)] uppercase tracking-wider mb-1">Std Dev</p>
                      <p className="text-sm font-semibold text-[var(--foreground)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(col.tempStdF, 2)}°F</p>
                    </div>
                  </div>
                  {(col.weatherTempAvgF != null || col.tempErrorPct != null) && (
                    <div className="mt-3 pt-3 border-t border-[var(--divider)] flex items-center justify-between">
                      <span className="text-xs text-[var(--foreground-muted)]">vs Weather: {formatValue(col.weatherTempAvgF)}°F</span>
                      <span className="text-xs font-medium" style={{ color: col.tempErrorPct != null ? (col.tempErrorPct < 3 ? 'var(--success)' : col.tempErrorPct < 5 ? 'var(--warning)' : 'var(--error)') : 'var(--foreground-muted)' }}>
                        {formatPercent(col.tempErrorPct)} Error
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Desktop: original tables */}
            <div className="hidden sm:block">
            <div className="glass-card card-stats p-4 sm:p-8 mb-8">
              <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)] mb-4 sm:mb-6">Temperature (°F)</h2>
              <div className="overflow-x-auto">
              <table className="w-full text-base sm:text-lg min-w-[400px]">
                <thead>
                  <tr className="border-b border-[var(--divider)]">
                    <th className="text-left py-4 text-[var(--foreground-muted)] font-semibold">Metric</th>
                    {deviceColumns.map(col => (
                      <th key={col.device.id} className="text-right py-4 font-semibold" style={{ color: col.device.color }}>
                        {col.device.display_name}
                      </th>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <th className="text-right py-4 text-[var(--foreground-muted)] font-semibold">Delta</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--divider)]">
                    <td className="py-4 text-[var(--foreground-muted)]">Average</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-4 text-right font-semibold text-[var(--foreground)]">{formatValue(col.tempAvgF)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-4 text-right text-[var(--foreground-muted)]/60">{formatDelta(deviceColumns.map(c => c.tempAvgF))}</td>
                    )}
                  </tr>
                  <tr className="border-b border-[var(--divider)]">
                    <td className="py-4 text-[var(--foreground-muted)]">Minimum</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-4 text-right font-semibold text-[var(--foreground)]">{formatValue(col.tempMinF)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-4 text-right text-[var(--foreground-muted)]/60">{formatDelta(deviceColumns.map(c => c.tempMinF))}</td>
                    )}
                  </tr>
                  <tr className="border-b border-[var(--divider)]">
                    <td className="py-4 text-[var(--foreground-muted)]">Maximum</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-4 text-right font-semibold text-[var(--foreground)]">{formatValue(col.tempMaxF)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-4 text-right text-[var(--foreground-muted)]/60">{formatDelta(deviceColumns.map(c => c.tempMaxF))}</td>
                    )}
                  </tr>
                  <tr>
                    <td className="py-4 text-[var(--foreground-muted)]">Std Dev</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-4 text-right font-semibold text-[var(--foreground)]">{formatValue(col.tempStdF, 2)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-4 text-right text-[var(--foreground-muted)]/60">—</td>
                    )}
                  </tr>
                  <tr className="border-t border-[var(--divider)] border-b border-[var(--divider)]">
                    <td className="py-4 text-[var(--foreground-muted)]">Weather</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-4 text-right font-semibold text-[var(--foreground)]">{formatValue(col.weatherTempAvgF)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-4 text-right text-[var(--foreground-muted)]/60">{formatDelta(deviceColumns.map(c => c.weatherTempAvgF))}</td>
                    )}
                  </tr>
                  <tr>
                    <td className="py-4 text-[var(--foreground-muted)]">% Error</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-4 text-right font-semibold text-[var(--foreground)]">{formatPercent(col.tempErrorPct)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-4 text-right text-[var(--foreground-muted)]/60">{formatDeltaPercent(deviceColumns.map(c => c.tempErrorPct))}</td>
                    )}
                  </tr>
                </tbody>
              </table>
              </div>
            </div>

            <div className="glass-card card-stats p-4 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold text-[var(--foreground)] mb-4 sm:mb-6">Humidity (%)</h2>
              <div className="overflow-x-auto">
              <table className="w-full text-base sm:text-lg min-w-[400px]">
                <thead>
                  <tr className="border-b border-[var(--divider)]">
                    <th className="text-left py-4 text-[var(--foreground-muted)] font-semibold">Metric</th>
                    {deviceColumns.map(col => (
                      <th key={col.device.id} className="text-right py-4 font-semibold" style={{ color: col.device.color }}>
                        {col.device.display_name}
                      </th>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <th className="text-right py-4 text-[var(--foreground-muted)] font-semibold">Delta</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--divider)]">
                    <td className="py-4 text-[var(--foreground-muted)]">Average</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-4 text-right font-semibold text-[var(--foreground)]">{formatValue(col.sensor?.humidity_avg)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-4 text-right text-[var(--foreground-muted)]/60">{formatDelta(deviceColumns.map(c => c.sensor?.humidity_avg))}</td>
                    )}
                  </tr>
                  <tr className="border-b border-[var(--divider)]">
                    <td className="py-4 text-[var(--foreground-muted)]">Minimum</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-4 text-right font-semibold text-[var(--foreground)]">{formatValue(col.sensor?.humidity_min)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-4 text-right text-[var(--foreground-muted)]/60">{formatDelta(deviceColumns.map(c => c.sensor?.humidity_min))}</td>
                    )}
                  </tr>
                  <tr className="border-b border-[var(--divider)]">
                    <td className="py-4 text-[var(--foreground-muted)]">Maximum</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-4 text-right font-semibold text-[var(--foreground)]">{formatValue(col.sensor?.humidity_max)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-4 text-right text-[var(--foreground-muted)]/60">{formatDelta(deviceColumns.map(c => c.sensor?.humidity_max))}</td>
                    )}
                  </tr>
                  <tr>
                    <td className="py-4 text-[var(--foreground-muted)]">Std Dev</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-4 text-right font-semibold text-[var(--foreground)]">{formatValue(col.sensor?.humidity_stddev, 2)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-4 text-right text-[var(--foreground-muted)]/60">—</td>
                    )}
                  </tr>
                  <tr className="border-t border-[var(--divider)] border-b border-[var(--divider)]">
                    <td className="py-4 text-[var(--foreground-muted)]">Weather</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-4 text-right font-semibold text-[var(--foreground)]">{formatValue(col.weather?.humidity_avg)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-4 text-right text-[var(--foreground-muted)]/60">{formatDelta(deviceColumns.map(c => c.weather?.humidity_avg))}</td>
                    )}
                  </tr>
                  <tr>
                    <td className="py-4 text-[var(--foreground-muted)]">% Error</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-4 text-right font-semibold text-[var(--foreground)]">{formatPercent(col.humidityErrorPct)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-4 text-right text-[var(--foreground-muted)]/60">{formatDeltaPercent(deviceColumns.map(c => c.humidityErrorPct))}</td>
                    )}
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
            </div>
          </div>
        )}
    </PageLayout>
  );
}
