'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { PageLayout } from '@/components/PageLayout';
import { DeviceStats, getDeviceStats, getDeployment } from '@/lib/supabase';
import { computePercentError, getScopedCompareDeviceIds } from '@/lib/weatherCompare';
import { formatValue, formatDelta, formatPercent, formatPercentDelta, safeC2F, safeDeltaC2F } from '@/lib/format';
import { useSetChatPageContext } from '@/lib/chatContext';
import { DEPLOYMENT_ALL_TIME_HOURS, DEPLOYMENT_ALL_TIME_LABEL, TIME_RANGES } from '@/lib/constants';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { FilterToolbar } from '@/components/FilterToolbar';
import { useTimeRange } from '@/hooks/useTimeRange';
import { useDeployments } from '@/hooks/useDeployments';

export default function ComparePage() {
  const [stats, setStats] = useState<DeviceStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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
    const map: Record<string, DeviceStats | null> = { node1: null, node2: null, weather_node1: null, weather_node2: null };
    for (const row of stats) {
      if (row.device_id in map) map[row.device_id] = row;
    }
    return map;
  }, [stats]);


  const node1 = statsByDevice.node1;
  const node2 = statsByDevice.node2;
  const weatherNode1 = statsByDevice.weather_node1;
  const weatherNode2 = statsByDevice.weather_node2;

  const node1TempAvgF = safeC2F(node1?.temp_avg);
  const node2TempAvgF = safeC2F(node2?.temp_avg);
  const node1TempMinF = safeC2F(node1?.temp_min);
  const node2TempMinF = safeC2F(node2?.temp_min);
  const node1TempMaxF = safeC2F(node1?.temp_max);
  const node2TempMaxF = safeC2F(node2?.temp_max);
  const node1TempStdF = safeDeltaC2F(node1?.temp_stddev);
  const node2TempStdF = safeDeltaC2F(node2?.temp_stddev);
  const weatherNode1TempAvgF = safeC2F(weatherNode1?.temp_avg);
  const weatherNode2TempAvgF = safeC2F(weatherNode2?.temp_avg);
  const node1TempErrorPct = computePercentError(node1TempAvgF, weatherNode1TempAvgF);
  const node2TempErrorPct = computePercentError(node2TempAvgF, weatherNode2TempAvgF);
  const node1HumidityErrorPct = computePercentError(node1?.humidity_avg, weatherNode1?.humidity_avg);
  const node2HumidityErrorPct = computePercentError(node2?.humidity_avg, weatherNode2?.humidity_avg);

  return (
    <PageLayout title="Compare" subtitle="Side-by-side sensor statistics">
        <FilterToolbar timeRange={timeRange} deployments={deployments} />

        {deploymentFilter && activeDeployment && (
          <div className="mb-6 px-4 py-2 rounded-lg bg-[#0075ff]/20 border border-[#0075ff]/30 inline-flex items-center gap-2">
            <span className="text-sm text-white">
              Showing: {activeDeployment.name} ({activeDeployment.location})
            </span>
            <button onClick={() => timeRange.setDeploymentFilter('')} className="text-[#a0aec0] hover:text-white">✕</button>
          </div>
        )}

        {isLoading ? (
          <>
            <div className="glass-card card-stats p-8 mb-8">
              <h2 className="text-2xl font-bold text-white mb-6">Temperature (°F)</h2>
              <LoadingSpinner message="Loading stats..." />
            </div>
            <div className="glass-card card-stats p-8">
              <h2 className="text-2xl font-bold text-white mb-6">Humidity (%)</h2>
              <LoadingSpinner message="Loading stats..." />
            </div>
          </>
        ) : (
          <div className="fade-in">
            <div className="glass-card card-stats p-4 sm:p-8 mb-8">
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">Temperature (°F)</h2>
              <div className="overflow-x-auto">
              <table className="w-full text-base sm:text-lg min-w-[400px]">
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
                  <tr className="border-t border-white/10 border-b border-white/5">
                    <td className="py-4 text-[#a0aec0]">Weather</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(weatherNode1TempAvgF)}</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(weatherNode2TempAvgF)}</td>
                    <td className="py-4 text-right text-[#a0aec0]/60">{formatDelta(weatherNode1TempAvgF, weatherNode2TempAvgF)}</td>
                  </tr>
                  <tr>
                    <td className="py-4 text-[#a0aec0]">% Error</td>
                    <td className="py-4 text-right font-semibold text-white">{formatPercent(node1TempErrorPct)}</td>
                    <td className="py-4 text-right font-semibold text-white">{formatPercent(node2TempErrorPct)}</td>
                    <td className="py-4 text-right text-[#a0aec0]/60">{formatPercentDelta(node1TempErrorPct, node2TempErrorPct)}</td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>

            <div className="glass-card card-stats p-4 sm:p-8">
              <h2 className="text-xl sm:text-2xl font-bold text-white mb-4 sm:mb-6">Humidity (%)</h2>
              <div className="overflow-x-auto">
              <table className="w-full text-base sm:text-lg min-w-[400px]">
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
                  <tr className="border-t border-white/10 border-b border-white/5">
                    <td className="py-4 text-[#a0aec0]">Weather</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(weatherNode1?.humidity_avg)}</td>
                    <td className="py-4 text-right font-semibold text-white">{formatValue(weatherNode2?.humidity_avg)}</td>
                    <td className="py-4 text-right text-[#a0aec0]/60">{formatDelta(weatherNode1?.humidity_avg, weatherNode2?.humidity_avg)}</td>
                  </tr>
                  <tr>
                    <td className="py-4 text-[#a0aec0]">% Error</td>
                    <td className="py-4 text-right font-semibold text-white">{formatPercent(node1HumidityErrorPct)}</td>
                    <td className="py-4 text-right font-semibold text-white">{formatPercent(node2HumidityErrorPct)}</td>
                    <td className="py-4 text-right text-[#a0aec0]/60">{formatPercentDelta(node1HumidityErrorPct, node2HumidityErrorPct)}</td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
          </div>
        )}
    </PageLayout>
  );
}
