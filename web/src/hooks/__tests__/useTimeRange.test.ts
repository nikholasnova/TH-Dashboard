import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase', () => ({
  getDeployment: vi.fn(),
}));

import { useTimeRange } from '../useTimeRange';
import { getDeployment } from '@/lib/supabase';
import { DEPLOYMENT_ALL_TIME_HOURS } from '@/lib/constants';

describe('useTimeRange', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('clamps custom range to deployment bounds when deployment is selected', async () => {
    vi.mocked(getDeployment).mockResolvedValue({
      id: 7,
      device_id: 'node2',
      name: 'Greenhouse',
      location: 'Backyard',
      notes: null,
      zip_code: '85142',
      started_at: '2026-02-10T00:00:00.000Z',
      ended_at: '2026-02-20T00:00:00.000Z',
      created_at: '2026-02-10T00:00:00.000Z',
    });

    const { result } = renderHook(() => useTimeRange());

    act(() => {
      result.current.setSelectedRange(-1);
      result.current.setCustomStart('2026-02-01T00:00');
      result.current.setCustomEnd('2026-02-28T00:00');
      result.current.setDeploymentFilter('7');
    });

    const bounds = await result.current.getRangeBounds();

    expect(bounds).toEqual({
      start: '2026-02-10T00:00:00.000Z',
      end: '2026-02-20T00:00:00.000Z',
      scopedDeviceId: 'node2',
    });
  });

  it('uses deployment-relative window when not in custom mode', async () => {
    vi.mocked(getDeployment).mockResolvedValue({
      id: 9,
      device_id: 'node1',
      name: 'Office',
      location: 'Lab',
      notes: null,
      zip_code: '85142',
      started_at: '2026-01-01T00:00:00.000Z',
      ended_at: '2026-01-15T12:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useTimeRange());

    act(() => {
      result.current.setDeploymentFilter('9');
      result.current.setSelectedRange(24);
    });

    const bounds = await result.current.getRangeBounds();

    expect(bounds).toEqual({
      start: '2026-01-14T12:00:00.000Z',
      end: '2026-01-15T12:00:00.000Z',
      scopedDeviceId: 'node1',
    });
  });

  it('uses full deployment bounds in deployment all-time mode', async () => {
    vi.mocked(getDeployment).mockResolvedValue({
      id: 12,
      device_id: 'node2',
      name: 'Garage',
      location: 'Driveway',
      notes: null,
      zip_code: '85142',
      started_at: '2026-01-01T00:00:00.000Z',
      ended_at: '2026-03-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
    });

    const { result } = renderHook(() => useTimeRange());

    act(() => {
      result.current.setDeploymentFilter('12');
      result.current.setSelectedRange(DEPLOYMENT_ALL_TIME_HOURS);
    });

    const bounds = await result.current.getRangeBounds();

    expect(bounds).toEqual({
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-03-01T00:00:00.000Z',
      scopedDeviceId: 'node2',
    });
  });

  it('resets all-time mode to default range when deployment filter is cleared', () => {
    const { result } = renderHook(() => useTimeRange());

    act(() => {
      result.current.setDeploymentFilter('12');
      result.current.setSelectedRange(DEPLOYMENT_ALL_TIME_HOURS);
    });

    act(() => {
      result.current.setDeploymentFilter('');
    });

    expect(result.current.selectedRange).toBe(24);
  });
});
