import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FilterToolbar } from '../FilterToolbar';
import type { UseTimeRangeReturn } from '@/hooks/useTimeRange';
import { DEPLOYMENT_ALL_TIME_HOURS, DEPLOYMENT_ALL_TIME_LABEL } from '@/lib/constants';

function makeTimeRange(overrides: Partial<UseTimeRangeReturn> = {}): UseTimeRangeReturn {
  return {
    selectedRange: -1,
    setSelectedRange: vi.fn(),
    customStart: '2026-02-10T00:00',
    setCustomStart: vi.fn(),
    customEnd: '2026-02-11T00:00',
    setCustomEnd: vi.fn(),
    deploymentFilter: '1',
    setDeploymentFilter: vi.fn(),
    deviceFilter: 'node1',
    setDeviceFilter: vi.fn(),
    isCustom: true,
    isCustomValid: true,
    getRangeBounds: vi.fn(),
    ...overrides,
  };
}

describe('FilterToolbar', () => {
  it('shows custom date inputs when custom range is selected with deployment filter', () => {
    render(<FilterToolbar timeRange={makeTimeRange()} deployments={[]} />);

    expect(screen.getByDisplayValue('2026-02-10T00:00')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-02-11T00:00')).toBeInTheDocument();
  });

  it('shows deployment all-time button when deployment filter is active', () => {
    render(
      <FilterToolbar
        timeRange={makeTimeRange({
          selectedRange: DEPLOYMENT_ALL_TIME_HOURS,
          isCustom: false,
        })}
        deployments={[]}
      />
    );

    expect(screen.getByRole('button', { name: DEPLOYMENT_ALL_TIME_LABEL })).toBeInTheDocument();
  });

  it('hides deployment all-time button when deployment filter is empty', () => {
    render(
      <FilterToolbar
        timeRange={makeTimeRange({
          deploymentFilter: '',
          selectedRange: 24,
          isCustom: false,
        })}
        deployments={[]}
      />
    );

    expect(screen.queryByRole('button', { name: DEPLOYMENT_ALL_TIME_LABEL })).not.toBeInTheDocument();
  });
});
