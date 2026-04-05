import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

const mockGetDevices = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getDevices: (...args: unknown[]) => mockGetDevices(...args),
}));

vi.mock('@/components/AuthProvider', () => ({
  useSession: () => ({ session: { user: { id: '1' } }, user: { id: '1' }, loading: false }),
}));

import { DevicesProvider, useDevices } from '../DevicesContext';

function Consumer() {
  const { devices, allDevices, isLoading, refresh } = useDevices();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="count">{devices.length}</span>
      <span data-testid="all-count">{allDevices.length}</span>
      <span data-testid="first-id">{devices[0]?.id || 'none'}</span>
      <button onClick={() => refresh()}>Refresh</button>
    </div>
  );
}

describe('DevicesContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('provides fallback devices initially then loads real devices', async () => {
    const activeDevices = [
      { id: 'sensor1', display_name: 'Sensor 1', color: '#000', is_active: true, monitor_enabled: true, sort_order: 1, created_at: '', updated_at: '' },
    ];
    const allDevices = [
      ...activeDevices,
      { id: 'sensor2', display_name: 'Sensor 2', color: '#fff', is_active: false, monitor_enabled: false, sort_order: 2, created_at: '', updated_at: '' },
    ];

    mockGetDevices.mockImplementation((activeOnly: boolean) =>
      Promise.resolve(activeOnly ? activeDevices : allDevices)
    );

    render(
      <DevicesProvider>
        <Consumer />
      </DevicesProvider>
    );

    // Initially shows fallback
    expect(screen.getByTestId('count').textContent).toBe('2');

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('all-count').textContent).toBe('2');
    expect(screen.getByTestId('first-id').textContent).toBe('sensor1');
  });

  it('refresh re-fetches devices', async () => {
    const devices = [
      { id: 'node1', display_name: 'Node 1', color: '#000', is_active: true, monitor_enabled: true, sort_order: 1, created_at: '', updated_at: '' },
    ];
    mockGetDevices.mockResolvedValue(devices);

    render(
      <DevicesProvider>
        <Consumer />
      </DevicesProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    mockGetDevices.mockClear();
    const updatedDevices = [
      ...devices,
      { id: 'node2', display_name: 'Node 2', color: '#fff', is_active: true, monitor_enabled: true, sort_order: 2, created_at: '', updated_at: '' },
    ];
    mockGetDevices.mockResolvedValue(updatedDevices);

    await act(async () => {
      screen.getByText('Refresh').click();
    });

    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('handles getDevices failure gracefully', async () => {
    mockGetDevices.mockRejectedValue(new Error('Network error'));

    render(
      <DevicesProvider>
        <Consumer />
      </DevicesProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });

    // Falls back to default devices
    expect(screen.getByTestId('count').textContent).toBe('2');
  });

  it('uses default context outside provider', () => {
    function Standalone() {
      const { devices, isLoading } = useDevices();
      return <span data-testid="standalone">{`${devices.length}-${isLoading}`}</span>;
    }

    render(<Standalone />);
    expect(screen.getByTestId('standalone').textContent).toBe('2-true');
  });
});
