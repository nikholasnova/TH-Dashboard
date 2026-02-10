'use client';

import { useState, useCallback } from 'react';
import { getDeployment } from '@/lib/supabase';

export interface TimeRangeBounds {
  start: string;
  end: string;
  scopedDeviceId?: string;
}

export interface UseTimeRangeOptions {
  defaultRange?: number;
}

export function useTimeRange(options: UseTimeRangeOptions = {}) {
  const [selectedRange, setSelectedRange] = useState(options.defaultRange ?? 24);
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
    if (deploymentFilter) {
      const dep = await getDeployment(parseInt(deploymentFilter, 10));
      if (dep) {
        return {
          start: dep.started_at,
          end: dep.ended_at || new Date().toISOString(),
          scopedDeviceId: dep.device_id,
        };
      }
    }

    if (isCustom) {
      return {
        start: new Date(customStart).toISOString(),
        end: new Date(customEnd).toISOString(),
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
  }, [selectedRange, isCustom, customStart, customEnd, deploymentFilter, deviceFilter]);

  const handleDeviceFilterChange = useCallback((value: string) => {
    setDeviceFilter(value);
    setDeploymentFilter('');
  }, []);

  return {
    selectedRange,
    setSelectedRange,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    deploymentFilter,
    setDeploymentFilter,
    deviceFilter,
    setDeviceFilter: handleDeviceFilterChange,
    isCustom,
    isCustomValid,
    getRangeBounds,
  };
}

export type UseTimeRangeReturn = ReturnType<typeof useTimeRange>;

