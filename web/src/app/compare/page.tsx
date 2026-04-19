'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { PageLayout } from '@/components/PageLayout';
import { DeviceStats, getDeviceStats } from '@/lib/supabase';
import { useGuest } from '@/contexts/GuestContext';
import { guestGetDeviceStats } from '@/lib/supabase/guestQueries';
import { computePercentError, getScopedCompareDeviceIds } from '@/lib/weatherCompare';
import { formatValue, formatPercent, safeC2F, safeDeltaC2F } from '@/lib/format';
import { useDevices } from '@/contexts/DevicesContext';
import { useSetChatPageContext } from '@/lib/chatContext';
import { DEPLOYMENT_ALL_TIME_HOURS, DEPLOYMENT_ALL_TIME_LABEL, TIME_RANGES } from '@/lib/constants';
import { FilterToolbar } from '@/components/FilterToolbar';
import { useTimeRange } from '@/hooks/useTimeRange';
import { useDeployments } from '@/hooks/useDeployments';
import { ViewportScaler } from '@/components/ViewportScaler';
import { resolveDeviceColor } from '@/lib/deviceColors';

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

let compareCache: DeviceStats[] | null = null;

export default function ComparePage() {
  const [stats, setStats] = useState<DeviceStats[]>(compareCache ?? []);
  const [isLoading, setIsLoading] = useState(!compareCache);

  const cacheRef = useRef(stats);
  cacheRef.current = stats;
  useEffect(() => {
    return () => { compareCache = cacheRef.current; };
  }, []);

  const { devices, isLoading: devicesLoading } = useDevices();
  const { isGuest } = useGuest();
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

  const hasDataRef2 = useRef(stats.length > 0);

  const fetchData = useCallback(async () => {
    if (isCustom && !isCustomValid) return;
    if (!hasDataRef2.current) setIsLoading(true);

    const fetchStats = isGuest ? guestGetDeviceStats : getDeviceStats;

    try {
      const { start, end, deployment: dep } = await getRangeBounds();
      const fetchForDeviceIds = async (deviceIds: string[]) => {
        const uniqueIds = Array.from(new Set(deviceIds));
        const statsByDevice = await Promise.all(
          uniqueIds.map((deviceId) => fetchStats({ start, end, device_id: deviceId }))
        );
        return statsByDevice.flat();
      };

      if (deploymentFilter) {
        if (!dep) {
          setStats([]);
        } else {
          const scoped = getScopedCompareDeviceIds({ deploymentDeviceId: dep.device_id });
          const data = scoped
            ? await fetchForDeviceIds(scoped)
            : await fetchStats({ start, end, device_id: dep.device_id });
          setStats(data);
        }
      } else {
        const scoped = getScopedCompareDeviceIds({ deviceFilter });
        const data = scoped
          ? await fetchForDeviceIds(scoped)
          : await fetchStats({ start, end, device_id: undefined });
        setStats(data);
      }
    } finally {
      setIsLoading(false);
      hasDataRef2.current = true;
    }
  }, [deploymentFilter, deviceFilter, getRangeBounds, isCustom, isCustomValid, isGuest]);

  useEffect(() => {
    if (devicesLoading) return;
    const timer = setTimeout(() => {
      void fetchData();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchData, devicesLoading]);

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
    <PageLayout title="Compare">
      <ViewportScaler>
        <FilterToolbar timeRange={timeRange} deployments={deployments} />

        {deploymentFilter && activeDeployment && (
          <div className="mb-6 px-4 py-2 rounded-lg bg-[var(--active-bg)] border border-[var(--divider)] inline-flex items-center gap-2">
            <span className="text-sm text-[var(--foreground)]">
              Showing: {activeDeployment.name} ({activeDeployment.location})
            </span>
            <button onClick={() => timeRange.setDeploymentFilter('')} className="text-[var(--foreground-muted)] hover:text-[var(--foreground)]" aria-label="Clear deployment filter">✕</button>
          </div>
        )}

        <div className={isLoading ? 'opacity-50' : 'fade-in'}>
            {/* Delta summary — desktop only */}
              <div className="hidden sm:grid sm:grid-cols-4 gap-8 pt-10 mb-10 border-t border-[var(--hairline)]">
                {(() => {
                  const validTemps = deviceColumns.filter(c => c.tempAvgF != null);
                  const tempSpread = validTemps.length >= 2
                    ? Math.abs(Math.max(...validTemps.map(c => c.tempAvgF!)) - Math.min(...validTemps.map(c => c.tempAvgF!)))
                    : null;
                  const validErrors = deviceColumns.filter(c => c.tempErrorPct != null);
                  const mostAccurate = validErrors.length > 0
                    ? validErrors.reduce((best, c) => (c.tempErrorPct! < best.tempErrorPct! ? c : best))
                    : null;
                  const totalReadings = deviceColumns.reduce((sum, c) => sum + (c.sensor?.reading_count ?? 0), 0);
                  const allHighs = deviceColumns.map(c => c.tempMaxF).filter((v): v is number => v != null);
                  const allLows = deviceColumns.map(c => c.tempMinF).filter((v): v is number => v != null);
                  const overallHigh = allHighs.length > 0 ? Math.max(...allHighs) : null;
                  const overallLow = allLows.length > 0 ? Math.min(...allLows) : null;

                  return (
                    <>
                      <div>
                        <p className="eyebrow mb-1">Temp Spread</p>
                        <p className="text-2xl font-semibold text-[var(--fg)] metric">
                          {tempSpread != null ? `${tempSpread.toFixed(1)}°F` : '—'}
                        </p>
                        <p className="text-xs text-[var(--fg-muted)] mt-1">between sensor averages</p>
                      </div>
                      <div>
                        <p className="eyebrow mb-1">Most Accurate</p>
                        <p className="text-2xl font-semibold text-[var(--fg)]">
                          {mostAccurate ? mostAccurate.device.display_name : '—'}
                        </p>
                        <p className="text-xs text-[var(--fg-muted)] mt-1">
                          {mostAccurate ? `${formatPercent(mostAccurate.tempErrorPct)} error vs weather` : 'no weather data'}
                        </p>
                      </div>
                      <div>
                        <p className="eyebrow mb-1">Overall Range</p>
                        <p className="text-2xl font-semibold text-[var(--fg)] metric">
                          {overallHigh != null && overallLow != null
                            ? <><span className="text-[var(--warning)]">{overallHigh.toFixed(1)}°</span>{' / '}<span className="text-[var(--fg-dim)]">{overallLow.toFixed(1)}°</span></>
                            : '—'}
                        </p>
                        <p className="text-xs text-[var(--fg-muted)] mt-1">high / low across all sensors</p>
                      </div>
                      <div>
                        <p className="eyebrow mb-1">Total Readings</p>
                        <p className="text-2xl font-semibold text-[var(--fg)] metric">
                          {totalReadings.toLocaleString()}
                        </p>
                        <p className="text-xs text-[var(--fg-muted)] mt-1">across {deviceColumns.length} sensor{deviceColumns.length !== 1 ? 's' : ''}</p>
                      </div>
                    </>
                  );
                })()}
              </div>

            {/* Range overlap bars — desktop only */}
              <div className="hidden sm:grid sm:grid-cols-2 gap-6 mb-6">
                {(() => {
                  const tempCols = deviceColumns.filter(c => c.tempMinF != null && c.tempMaxF != null);
                  const humCols = deviceColumns.filter(c => c.sensor?.humidity_min != null && c.sensor?.humidity_max != null);
                  const tempGlobalMin = tempCols.length > 0 ? Math.min(...tempCols.map(c => c.tempMinF!)) : 0;
                  const tempGlobalMax = tempCols.length > 0 ? Math.max(...tempCols.map(c => c.tempMaxF!)) : 100;
                  const tempRange = tempGlobalMax - tempGlobalMin || 1;
                  const humGlobalMin = humCols.length > 0 ? Math.min(...humCols.map(c => c.sensor!.humidity_min!)) : 0;
                  const humGlobalMax = humCols.length > 0 ? Math.max(...humCols.map(c => c.sensor!.humidity_max!)) : 100;
                  const humRange = humGlobalMax - humGlobalMin || 1;

                  return (
                    <>
                      <div className="py-5 sm:py-6">
                        <p className="eyebrow mb-3">Temperature Range Overlap</p>
                        <div className="space-y-2.5" style={{ minHeight: deviceColumns.length * 32 }}>
                          {tempCols.map(col => {
                            const left = ((col.tempMinF! - tempGlobalMin) / tempRange) * 100;
                            const width = ((col.tempMaxF! - col.tempMinF!) / tempRange) * 100;
                            return (
                              <div key={col.device.id}>
                                <div className="flex justify-between text-xs text-[var(--foreground-muted)] mb-1">
                                  <span style={{ color: resolveDeviceColor(col.device) }}>{col.device.display_name}</span>
                                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(col.tempMinF)}° – {formatValue(col.tempMaxF)}°</span>
                                </div>
                                <div className="h-2.5 w-full bg-[var(--hover-bg)] rounded-full relative">
                                  <div
                                    className="absolute h-full rounded-full"
                                    style={{ left: `${left}%`, width: `${Math.max(width, 2)}%`, backgroundColor: resolveDeviceColor(col.device), opacity: 0.9 }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex justify-between text-[10px] text-[var(--foreground-muted)] mt-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          <span>{tempGlobalMin.toFixed(1)}°F</span>
                          <span>{tempGlobalMax.toFixed(1)}°F</span>
                        </div>
                      </div>
                      <div className="py-5 sm:py-6">
                        <p className="eyebrow mb-3">Humidity Range Overlap</p>
                        <div className="space-y-2.5" style={{ minHeight: deviceColumns.length * 32 }}>
                          {humCols.map(col => {
                            const left = ((col.sensor!.humidity_min! - humGlobalMin) / humRange) * 100;
                            const width = ((col.sensor!.humidity_max! - col.sensor!.humidity_min!) / humRange) * 100;
                            return (
                              <div key={col.device.id}>
                                <div className="flex justify-between text-xs text-[var(--foreground-muted)] mb-1">
                                  <span style={{ color: resolveDeviceColor(col.device) }}>{col.device.display_name}</span>
                                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(col.sensor?.humidity_min)}% – {formatValue(col.sensor?.humidity_max)}%</span>
                                </div>
                                <div className="h-2.5 w-full bg-[var(--hover-bg)] rounded-full relative">
                                  <div
                                    className="absolute h-full rounded-full"
                                    style={{ left: `${left}%`, width: `${Math.max(width, 2)}%`, backgroundColor: resolveDeviceColor(col.device), opacity: 0.9 }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex justify-between text-[10px] text-[var(--foreground-muted)] mt-2" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          <span>{humGlobalMin.toFixed(1)}%</span>
                          <span>{humGlobalMax.toFixed(1)}%</span>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>

            {/* Mobile: stacked cards per device */}
            <div className="sm:hidden space-y-4">
              {deviceColumns.map(col => (
                <div key={col.device.id} className="surface p-4">
                  <h3 className="text-base font-semibold mb-3" style={{ color: resolveDeviceColor(col.device) }}>
                    {col.device.display_name}
                  </h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                    <div>
                      <p className="eyebrow mb-1">Avg Temp</p>
                      <p className="text-lg font-semibold text-[var(--foreground)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(col.tempAvgF)}°F</p>
                    </div>
                    <div>
                      <p className="eyebrow mb-1">Avg Humidity</p>
                      <p className="text-lg font-semibold text-[var(--foreground)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatValue(col.sensor?.humidity_avg)}%</p>
                    </div>
                    <div>
                      <p className="eyebrow mb-1">High / Low</p>
                      <p className="text-sm font-semibold text-[var(--foreground)]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        <span className="text-[var(--warning)]">{formatValue(col.tempMaxF)}°</span>
                        {' / '}
                        <span className="text-[var(--info)]">{formatValue(col.tempMinF)}°</span>
                      </p>
                    </div>
                    <div>
                      <p className="eyebrow mb-1">Std Dev</p>
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

            {/* Desktop: side-by-side tables */}
            <div className="hidden sm:grid sm:grid-cols-2 sm:gap-6">
            <div className="py-4 sm:py-6">
              <h2 className="text-xl sm:text-2xl font-semibold text-[var(--foreground)] mb-3 sm:mb-4">Temperature (°F)</h2>
              <div className="overflow-x-auto">
              <table className="w-full text-sm sm:text-base">
                <thead>
                  <tr className="border-b border-[var(--divider)]">
                    <th className="text-left py-3 text-[var(--foreground-muted)] font-semibold">Metric</th>
                    {deviceColumns.map(col => (
                      <th key={col.device.id} className="text-right py-3 font-semibold" style={{ color: resolveDeviceColor(col.device) }}>
                        {col.device.display_name}
                      </th>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <th className="text-right py-3 text-[var(--foreground-muted)] font-semibold">Delta</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--divider)]">
                    <td className="py-3 text-[var(--foreground-muted)]">Average</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-3 text-right font-semibold text-[var(--foreground)]">{formatValue(col.tempAvgF)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-3 text-right text-[var(--foreground-muted)]/60">{formatDelta(deviceColumns.map(c => c.tempAvgF))}</td>
                    )}
                  </tr>
                  <tr className="border-b border-[var(--divider)]">
                    <td className="py-3 text-[var(--foreground-muted)]">Minimum</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-3 text-right font-semibold text-[var(--foreground)]">{formatValue(col.tempMinF)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-3 text-right text-[var(--foreground-muted)]/60">{formatDelta(deviceColumns.map(c => c.tempMinF))}</td>
                    )}
                  </tr>
                  <tr className="border-b border-[var(--divider)]">
                    <td className="py-3 text-[var(--foreground-muted)]">Maximum</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-3 text-right font-semibold text-[var(--foreground)]">{formatValue(col.tempMaxF)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-3 text-right text-[var(--foreground-muted)]/60">{formatDelta(deviceColumns.map(c => c.tempMaxF))}</td>
                    )}
                  </tr>
                  <tr>
                    <td className="py-3 text-[var(--foreground-muted)]">Std Dev</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-3 text-right font-semibold text-[var(--foreground)]">{formatValue(col.tempStdF, 2)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-3 text-right text-[var(--foreground-muted)]/60">—</td>
                    )}
                  </tr>
                  <tr className="border-t border-[var(--divider)] border-b border-[var(--divider)]">
                    <td className="py-3 text-[var(--foreground-muted)]">Weather</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-3 text-right font-semibold text-[var(--foreground)]">{formatValue(col.weatherTempAvgF)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-3 text-right text-[var(--foreground-muted)]/60">{formatDelta(deviceColumns.map(c => c.weatherTempAvgF))}</td>
                    )}
                  </tr>
                  <tr>
                    <td className="py-3 text-[var(--foreground-muted)]">% Error</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-3 text-right font-semibold text-[var(--foreground)]">{formatPercent(col.tempErrorPct)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-3 text-right text-[var(--foreground-muted)]/60">{formatDeltaPercent(deviceColumns.map(c => c.tempErrorPct))}</td>
                    )}
                  </tr>
                </tbody>
              </table>
              </div>
            </div>

            <div className="py-4 sm:py-6">
              <h2 className="text-xl sm:text-2xl font-semibold text-[var(--foreground)] mb-3 sm:mb-4">Humidity (%)</h2>
              <div className="overflow-x-auto">
              <table className="w-full text-sm sm:text-base">
                <thead>
                  <tr className="border-b border-[var(--divider)]">
                    <th className="text-left py-3 text-[var(--foreground-muted)] font-semibold">Metric</th>
                    {deviceColumns.map(col => (
                      <th key={col.device.id} className="text-right py-3 font-semibold" style={{ color: resolveDeviceColor(col.device) }}>
                        {col.device.display_name}
                      </th>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <th className="text-right py-3 text-[var(--foreground-muted)] font-semibold">Delta</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--divider)]">
                    <td className="py-3 text-[var(--foreground-muted)]">Average</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-3 text-right font-semibold text-[var(--foreground)]">{formatValue(col.sensor?.humidity_avg)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-3 text-right text-[var(--foreground-muted)]/60">{formatDelta(deviceColumns.map(c => c.sensor?.humidity_avg))}</td>
                    )}
                  </tr>
                  <tr className="border-b border-[var(--divider)]">
                    <td className="py-3 text-[var(--foreground-muted)]">Minimum</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-3 text-right font-semibold text-[var(--foreground)]">{formatValue(col.sensor?.humidity_min)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-3 text-right text-[var(--foreground-muted)]/60">{formatDelta(deviceColumns.map(c => c.sensor?.humidity_min))}</td>
                    )}
                  </tr>
                  <tr className="border-b border-[var(--divider)]">
                    <td className="py-3 text-[var(--foreground-muted)]">Maximum</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-3 text-right font-semibold text-[var(--foreground)]">{formatValue(col.sensor?.humidity_max)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-3 text-right text-[var(--foreground-muted)]/60">{formatDelta(deviceColumns.map(c => c.sensor?.humidity_max))}</td>
                    )}
                  </tr>
                  <tr>
                    <td className="py-3 text-[var(--foreground-muted)]">Std Dev</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-3 text-right font-semibold text-[var(--foreground)]">{formatValue(col.sensor?.humidity_stddev, 2)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-3 text-right text-[var(--foreground-muted)]/60">—</td>
                    )}
                  </tr>
                  <tr className="border-t border-[var(--divider)] border-b border-[var(--divider)]">
                    <td className="py-3 text-[var(--foreground-muted)]">Weather</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-3 text-right font-semibold text-[var(--foreground)]">{formatValue(col.weather?.humidity_avg)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-3 text-right text-[var(--foreground-muted)]/60">{formatDelta(deviceColumns.map(c => c.weather?.humidity_avg))}</td>
                    )}
                  </tr>
                  <tr>
                    <td className="py-3 text-[var(--foreground-muted)]">% Error</td>
                    {deviceColumns.map(col => (
                      <td key={col.device.id} className="py-3 text-right font-semibold text-[var(--foreground)]">{formatPercent(col.humidityErrorPct)}</td>
                    ))}
                    {deviceColumns.length >= 2 && (
                      <td className="py-3 text-right text-[var(--foreground-muted)]/60">{formatDeltaPercent(deviceColumns.map(c => c.humidityErrorPct))}</td>
                    )}
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
            </div>
          </div>
      </ViewportScaler>
    </PageLayout>
  );
}
