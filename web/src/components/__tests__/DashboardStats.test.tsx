import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { DeviceStats } from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  celsiusToFahrenheit: (c: number) => c * 9 / 5 + 32,
  DeviceStats: {},
}));

vi.mock('@/lib/format', () => ({
  safeC2F: (c: number | null | undefined) => c != null ? c * 9 / 5 + 32 : null,
  formatPercent: (n: number) => `${n.toFixed(1)}%`,
}));

vi.mock('@/lib/weatherCompare', () => ({
  computePercentError: (sensor: number | null, weather: number | null) => {
    if (sensor == null || weather == null || weather === 0) return null;
    return Math.abs(sensor - weather) / Math.abs(weather) * 100;
  },
}));

vi.mock('@/contexts/DevicesContext', () => ({
  useDevices: () => ({
    devices: [
      { id: 'node1', display_name: 'Node 1', color: '#000', is_active: true, monitor_enabled: true, sort_order: 1, created_at: '', updated_at: '' },
    ],
  }),
}));

import { DashboardStats } from '../DashboardStats';

const baseStat: DeviceStats = {
  device_id: 'node1',
  temp_avg: 20,
  temp_min: 18,
  temp_max: 22,
  reading_count: 100,
  humidity_avg: 50,
  humidity_min: 40,
  humidity_max: 60,
  temp_stddev: 1,
  humidity_stddev: 2,
};

describe('DashboardStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state when loading prop is true', () => {
    const { container } = render(<DashboardStats stats={[]} loading={true} />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('renders temperature stats after loading', () => {
    render(<DashboardStats stats={[baseStat]} loading={false} />);
    expect(screen.getByText(/68\.0°F/)).toBeInTheDocument();
  });

  it('renders high/low temperatures', () => {
    const stat = { ...baseStat, temp_min: 15, temp_max: 25, reading_count: 50 };
    render(<DashboardStats stats={[stat]} loading={false} />);
    expect(screen.getByText('77.0°')).toBeInTheDocument();
    expect(screen.getByText('59.0°')).toBeInTheDocument();
  });

  it('renders reading count', () => {
    const stat = { ...baseStat, reading_count: 1234 };
    render(<DashboardStats stats={[stat]} loading={false} />);
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('shows "No weather data" when no weather stats', () => {
    render(<DashboardStats stats={[baseStat]} loading={false} />);
    expect(screen.getByText('No weather data')).toBeInTheDocument();
  });

  it('returns null when no sensor stats match devices', () => {
    const otherStat = { ...baseStat, device_id: 'other_device' };
    const { container } = render(<DashboardStats stats={[otherStat]} loading={false} />);
    expect(container.querySelector('.section-label')).not.toBeInTheDocument();
  });
});
