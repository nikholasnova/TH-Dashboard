'use client';

import { useEffect, useState, useCallback } from 'react';
import { getDistinctLocations, getDeployments, DeploymentWithCount } from '@/lib/supabase';

export interface FilterState {
  timeRange: '1h' | '6h' | '24h' | '7d' | 'custom';
  startDate?: Date;
  endDate?: Date;
  location?: string;
  device_id?: string;
  deployment_id?: number;
}

interface FilterBarProps {
  onFilterChange: (filters: FilterState) => void;
  initialFilters?: Partial<FilterState>;
  showDeploymentFilter?: boolean;
}

const TIME_RANGES: { label: string; value: FilterState['timeRange'] }[] = [
  { label: '1h', value: '1h' },
  { label: '6h', value: '6h' },
  { label: '24h', value: '24h' },
  { label: '7d', value: '7d' },
  { label: 'Custom', value: 'custom' },
];

export default function FilterBar({ onFilterChange, initialFilters, showDeploymentFilter = true }: FilterBarProps) {
  const [filters, setFilters] = useState<FilterState>({
    timeRange: initialFilters?.timeRange || '24h',
    startDate: initialFilters?.startDate,
    endDate: initialFilters?.endDate,
    location: initialFilters?.location,
    device_id: initialFilters?.device_id,
    deployment_id: initialFilters?.deployment_id,
  });

  const [locations, setLocations] = useState<string[]>([]);
  const [deployments, setDeployments] = useState<DeploymentWithCount[]>([]);
  const [customStartStr, setCustomStartStr] = useState('');
  const [customEndStr, setCustomEndStr] = useState('');

  useEffect(() => {
    async function fetchOptions() {
      const [locs, deps] = await Promise.all([getDistinctLocations(), getDeployments()]);
      setLocations(locs);
      setDeployments(deps);
    }
    fetchOptions();
  }, []);

  const notifyParent = useCallback((newFilters: FilterState) => {
    onFilterChange(newFilters);
  }, [onFilterChange]);

  const handleTimeRangeChange = (range: FilterState['timeRange']) => {
    const newFilters: FilterState = {
      ...filters,
      timeRange: range,
      startDate: range === 'custom' ? filters.startDate : undefined,
      endDate: range === 'custom' ? filters.endDate : undefined,
    };
    setFilters(newFilters);
    if (range !== 'custom') notifyParent(newFilters);
  };

  const handleCustomDateChange = (type: 'start' | 'end', value: string) => {
    if (type === 'start') setCustomStartStr(value);
    else setCustomEndStr(value);

    if (!value) return;

    const date = new Date(value);
    const newFilters = { ...filters, [type === 'start' ? 'startDate' : 'endDate']: date };
    setFilters(newFilters);

    if (newFilters.startDate && newFilters.endDate && newFilters.startDate < newFilters.endDate) {
      notifyParent(newFilters);
    }
  };

  const handleFilterChange = (key: 'location' | 'device_id' | 'deployment_id', value: string) => {
    const newFilters: FilterState = {
      ...filters,
      [key]: value || undefined,
      ...(key === 'device_id' ? { deployment_id: undefined } : {}),
    };
    if (key === 'deployment_id') {
      newFilters.deployment_id = value ? parseInt(value, 10) : undefined;
    }
    setFilters(newFilters);
    notifyParent(newFilters);
  };

  const isCustom = filters.timeRange === 'custom';
  const filteredDeployments = deployments.filter((dep) => {
    if (filters.device_id && dep.device_id !== filters.device_id) return false;
    if (filters.location && dep.location !== filters.location) return false;
    return true;
  });

  return (
    <div className="flex flex-wrap gap-4 mb-8">
      <div className="glass-card p-2 flex gap-1">
        {TIME_RANGES.map((range) => (
          <button
            key={range.value}
            onClick={() => handleTimeRangeChange(range.value)}
            className={`px-5 py-2.5 text-sm rounded-xl transition-all ${
              filters.timeRange === range.value
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
              value={customStartStr}
              onChange={(e) => handleCustomDateChange('start', e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#a0aec0]">End</label>
            <input
              type="datetime-local"
              value={customEndStr}
              onChange={(e) => handleCustomDateChange('end', e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
        </div>
      )}

      <div className="glass-card p-3 flex flex-wrap items-center gap-4">
        <span className="text-xs text-[#a0aec0] font-medium">Filters:</span>

        <select
          value={filters.location || ''}
          onChange={(e) => handleFilterChange('location', e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[120px]"
        >
          <option value="">All Locations</option>
          {locations.map((loc) => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>

        <select
          value={filters.device_id || ''}
          onChange={(e) => handleFilterChange('device_id', e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[100px]"
        >
          <option value="">All Devices</option>
          <option value="node1">Node 1</option>
          <option value="node2">Node 2</option>
        </select>

        {showDeploymentFilter && (
          <select
            value={filters.deployment_id?.toString() || ''}
            onChange={(e) => handleFilterChange('deployment_id', e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[180px]"
          >
            <option value="">All Deployments</option>
            {filteredDeployments.map((dep) => (
              <option key={dep.id} value={dep.id.toString()}>
                {dep.name} ({dep.device_id})
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
