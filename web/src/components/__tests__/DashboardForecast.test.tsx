import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockGetPyodide = vi.fn();
const mockRunHourlyForecast = vi.fn();

vi.mock('@/lib/pyodide', () => ({
  getPyodide: (...args: unknown[]) => mockGetPyodide(...args),
}));

vi.mock('@/lib/analysisRunner', () => ({
  runHourlyForecast: (...args: unknown[]) => mockRunHourlyForecast(...args),
}));

vi.mock('@/contexts/DevicesContext', () => ({
  useDevices: () => ({
    devices: [
      { id: 'node1', display_name: 'Node 1', color: '#000', is_active: true, monitor_enabled: true, sort_order: 1, created_at: '', updated_at: '' },
    ],
    isLoading: false,
  }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: Record<string, unknown>) => {
      const { initial: _i, animate: _a, transition: _t, layoutId: _l, ...rest } = props;
      return <div {...rest}>{children as React.ReactNode}</div>;
    },
  },
}));

vi.stubGlobal('ResizeObserver', vi.fn(() => ({
  observe: vi.fn(),
  disconnect: vi.fn(),
  unobserve: vi.fn(),
})));

import { DashboardForecast } from '../DashboardForecast';

describe('DashboardForecast', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows Run Forecast button initially', () => {
    render(<DashboardForecast />);
    expect(screen.getByText('Run Forecast')).toBeInTheDocument();
    expect(screen.getByText('24-Hour Forecast')).toBeInTheDocument();
  });

  it('shows loading state after clicking Run Forecast', async () => {
    mockGetPyodide.mockReturnValue(new Promise(() => {}));
    render(<DashboardForecast />);

    await user.click(screen.getByText('Run Forecast'));
    expect(screen.getByText('Loading Python runtime...')).toBeInTheDocument();
  });

  it('shows no-data state when forecast returns empty', async () => {
    mockGetPyodide.mockResolvedValue({});
    mockRunHourlyForecast.mockResolvedValue([]);

    render(<DashboardForecast />);
    await user.click(screen.getByText('Run Forecast'));

    await waitFor(() => {
      expect(screen.getByText('Not enough data for forecasting')).toBeInTheDocument();
    });
  });

  it('shows error state when pyodide fails', async () => {
    mockGetPyodide.mockRejectedValue(new Error('CDN error'));

    render(<DashboardForecast />);
    await user.click(screen.getByText('Run Forecast'));

    await waitFor(() => {
      expect(screen.getByText('Forecast unavailable')).toBeInTheDocument();
    });
  });

  it('shows retry button on error', async () => {
    mockGetPyodide.mockRejectedValue(new Error('CDN error'));

    render(<DashboardForecast />);
    await user.click(screen.getByText('Run Forecast'));

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });
});
