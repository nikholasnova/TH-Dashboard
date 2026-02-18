'use client';

import { useState, useCallback } from 'react';
import { getDeployment } from '@/lib/supabase';
import { DEPLOYMENT_ALL_TIME_HOURS } from '@/lib/constants';

export interface TimeRangeBounds {
  start: string;
  end: string;
  scopedDeviceId?: string;
}

export interface UseTimeRangeOptions {
  defaultRange?: number;
}

export function useTimeRange(options: UseTimeRangeOptions = {}) {
  const defaultRange = options.defaultRange ?? 24;
  const [selectedRange, setSelectedRange] = useState(defaultRange);
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [deploymentFilter, setDeploymentFilter] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('');

  const isCustom = selectedRange === -1;
  const isCustomValid =
    !!customStart &&
    !!customEnd &&
    new Date(customStart).getTime() < new Date(customEnd).getTime();

  const getRangeBounds = useCallback(async (): Promise<TimeRangeBounds> => {
    const dep = deploymentFilter
      ? await getDeployment(parseInt(deploymentFilter, 10))
      : null;

    if (isCustom) {
      const customStartIso = new Date(customStart).toISOString();
      const customEndIso = new Date(customEnd).toISOString();

      if (dep) {
        const depStartMs = new Date(dep.started_at).getTime();
        const depEndMs = new Date(dep.ended_at || new Date().toISOString()).getTime();
        const customStartMs = new Date(customStartIso).getTime();
        const customEndMs = new Date(customEndIso).getTime();
        return {
          start: new Date(Math.max(customStartMs, depStartMs)).toISOString(),
          end: new Date(Math.min(customEndMs, depEndMs)).toISOString(),
          scopedDeviceId: dep.device_id,
        };
      }

      return {
        start: customStartIso,
        end: customEndIso,
        scopedDeviceId: deviceFilter || undefined,
      };
    }

    if (dep) {
      if (selectedRange === DEPLOYMENT_ALL_TIME_HOURS) {
        return {
          start: dep.started_at,
          end: dep.ended_at || new Date().toISOString(),
          scopedDeviceId: dep.device_id,
        };
      }

      const depEnd = new Date(dep.ended_at || new Date().toISOString());
      const relativeStart = new Date(depEnd.getTime() - selectedRange * 60 * 60 * 1000);
      return {
        start: new Date(Math.max(relativeStart.getTime(), new Date(dep.started_at).getTime())).toISOString(),
        end: depEnd.toISOString(),
        scopedDeviceId: dep.device_id,
      };
    }

    if (selectedRange === DEPLOYMENT_ALL_TIME_HOURS) {
      const end = new Date();
      const start = new Date(end.getTime() - defaultRange * 60 * 60 * 1000);
      return {
        start: start.toISOString(),
        end: end.toISOString(),
        scopedDeviceId: deviceFilter || undefined,
      };
    }

    const end = new Date();
    const start = new Date(end.getTime() - selectedRange * 60 * 60 * 1000);
    return {
      start: start.toISOString(),
      end: end.toISOString(),
      scopedDeviceId: deviceFilter || undefined,
    };
  }, [selectedRange, isCustom, customStart, customEnd, deploymentFilter, deviceFilter, defaultRange]);

  const handleDeviceFilterChange = useCallback((value: string) => {
    setDeviceFilter(value);
    setDeploymentFilter('');
    if (selectedRange === DEPLOYMENT_ALL_TIME_HOURS) {
      setSelectedRange(defaultRange);
    }
  }, [defaultRange, selectedRange]);

  const handleDeploymentFilterChange = useCallback((value: string) => {
    setDeploymentFilter(value);
    if (!value && selectedRange === DEPLOYMENT_ALL_TIME_HOURS) {
      setSelectedRange(defaultRange);
    }
  }, [defaultRange, selectedRange]);

  return {
    selectedRange,
    setSelectedRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    deploymentFilter,
    setDeploymentFilter: handleDeploymentFilterChange,
    deviceFilter,
    setDeviceFilter: handleDeviceFilterChange,
    isCustom,
    isCustomValid,
    getRangeBounds,
  };
}

export type UseTimeRangeReturn = ReturnType<typeof useTimeRange>;
