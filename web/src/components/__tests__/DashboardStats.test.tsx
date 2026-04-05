import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockGetDeviceStats = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getDeviceStats: (...args: unknown[]) => mockGetDeviceStats(...args),
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

vi.mock('@/lib/constants', () => ({
  REFRESH_INTERVAL: 999999,
}));

vi.mock('@/contexts/DevicesContext', () => ({
  useDevices: () => ({
    devices: [
      { id: 'node1', display_name: 'Node 1', color: '#000', is_active: true, monitor_enabled: true, sort_order: 1, created_at: '', updated_at: '' },
    ],
  }),
}));

import { DashboardStats } from '../DashboardStats';

describe('DashboardStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state initially', () => {
    mockGetDeviceStats.mockReturnValue(new Promise(() => {}));
    render(<DashboardStats />);
    expect(screen.getByText('Loading 24h stats...')).toBeInTheDocument();
  });

  it('renders temperature stats after loading', async () => {
    mockGetDeviceStats.mockResolvedValue([
      { device_id: 'node1', temp_avg: 20, temp_min: 18, temp_max: 22, reading_count: 100, humidity_avg: 50, humidity_min: 40, humidity_max: 60, temp_stddev: 1, humidity_stddev: 2 },
    ]);

    render(<DashboardStats />);
    await waitFor(() => {
      expect(screen.getByText(/68\.0°F/)).toBeInTheDocument();
    });
  });

  it('renders high/low temperatures', async () => {
    mockGetDeviceStats.mockResolvedValue([
      { device_id: 'node1', temp_avg: 20, temp_min: 15, temp_max: 25, reading_count: 50, humidity_avg: 45, humidity_min: 40, humidity_max: 50, temp_stddev: 1, humidity_stddev: 2 },
    ]);

    render(<DashboardStats />);
    await waitFor(() => {
      expect(screen.getByText('77.0°')).toBeInTheDocument();
      expect(screen.getByText('59.0°')).toBeInTheDocument();
    });
  });

  it('renders reading count', async () => {
    mockGetDeviceStats.mockResolvedValue([
      { device_id: 'node1', temp_avg: 20, temp_min: 18, temp_max: 22, reading_count: 1234, humidity_avg: 50, humidity_min: 40, humidity_max: 60, temp_stddev: 1, humidity_stddev: 2 },
    ]);

    render(<DashboardStats />);
    await waitFor(() => {
      expect(screen.getByText('1,234')).toBeInTheDocument();
    });
  });

  it('shows "No weather data" when no weather stats', async () => {
    mockGetDeviceStats.mockResolvedValue([
      { device_id: 'node1', temp_avg: 20, temp_min: 18, temp_max: 22, reading_count: 10, humidity_avg: 50, humidity_min: 40, humidity_max: 60, temp_stddev: 1, humidity_stddev: 2 },
    ]);

    render(<DashboardStats />);
    await waitFor(() => {
      expect(screen.getByText('No weather data')).toBeInTheDocument();
    });
  });

  it('returns null when no sensor stats match devices', async () => {
    mockGetDeviceStats.mockResolvedValue([
      { device_id: 'other_device', temp_avg: 20, reading_count: 10 },
    ]);

    const { container } = render(<DashboardStats />);
    await waitFor(() => {
      expect(screen.queryByText('Loading 24h stats...')).not.toBeInTheDocument();
    });
    expect(container.querySelector('.section-label')).not.toBeInTheDocument();
  });
});
