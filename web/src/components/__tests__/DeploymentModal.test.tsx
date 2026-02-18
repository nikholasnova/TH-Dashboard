import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeploymentModal } from '../DeploymentModal';
import {
  getActiveDeployment,
  createDeployment,
  endDeployment,
  updateDeployment,
  deleteDeployment,
} from '@/lib/supabase';

vi.mock('@/lib/supabase', () => ({
  getActiveDeployment: vi.fn(),
  createDeployment: vi.fn(),
  endDeployment: vi.fn(),
  updateDeployment: vi.fn(),
  deleteDeployment: vi.fn(),
}));

function makeDeployment(overrides: Partial<{
  id: number;
  device_id: string;
  name: string;
  location: string;
  notes: string | null;
  zip_code: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}> = {}) {
  return {
    id: 1,
    device_id: 'node1',
    name: 'Node 1 Active',
    location: 'Yard',
    notes: null,
    zip_code: '85142',
    started_at: '2026-02-01T00:00:00.000Z',
    ended_at: null,
    created_at: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('DeploymentModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(updateDeployment).mockResolvedValue(null);
    vi.mocked(deleteDeployment).mockResolvedValue(false);
  });

  it('ends the active deployment for the selected target device before creating', async () => {
    const node1Active = makeDeployment({ id: 11, device_id: 'node1', name: 'Node 1 Active' });
    const node2Active = makeDeployment({ id: 22, device_id: 'node2', name: 'Node 2 Active' });
    const node2New = makeDeployment({ id: 33, device_id: 'node2', name: 'Node 2 New' });

    vi.mocked(getActiveDeployment).mockImplementation(async (deviceId: string) => {
      if (deviceId === 'node1') return node1Active;
      if (deviceId === 'node2') return node2Active;
      return null;
    });
    vi.mocked(endDeployment).mockResolvedValue({
      ...node2Active,
      ended_at: '2026-02-10T00:00:00.000Z',
    });
    vi.mocked(createDeployment).mockResolvedValue(node2New);

    const onDeploymentChange = vi.fn();
    const user = userEvent.setup();

    render(
      <DeploymentModal
        deviceId="node1"
        deviceName="Node 1"
        isOpen={true}
        onClose={vi.fn()}
        onDeploymentChange={onDeploymentChange}
      />
    );

    await screen.findByText('Active Deployment');

    const deviceSelect = screen.getByRole('combobox');
    await user.selectOptions(deviceSelect, 'node2');
    await user.type(screen.getByPlaceholderText('e.g., Kitchen Test Week 1'), 'Node 2 Fresh Deployment');
    await user.type(screen.getByPlaceholderText('e.g., Kitchen'), 'Patio');
    await user.click(screen.getByRole('button', { name: 'End Current & Start New' }));

    await waitFor(() => {
      expect(endDeployment).toHaveBeenCalledWith(22);
    });
    expect(endDeployment).not.toHaveBeenCalledWith(11);
    expect(createDeployment).toHaveBeenCalledWith(
      expect.objectContaining({ device_id: 'node2' })
    );
    expect(onDeploymentChange).toHaveBeenCalled();
  });

  it('shows an error and keeps state when ending a deployment fails', async () => {
    vi.mocked(getActiveDeployment).mockResolvedValue(makeDeployment({ id: 44, device_id: 'node1' }));
    vi.mocked(endDeployment).mockResolvedValue(null);
    vi.mocked(createDeployment).mockResolvedValue(null);

    const onDeploymentChange = vi.fn();
    const user = userEvent.setup();

    render(
      <DeploymentModal
        deviceId="node1"
        deviceName="Node 1"
        isOpen={true}
        onClose={vi.fn()}
        onDeploymentChange={onDeploymentChange}
      />
    );

    await screen.findByText('Active Deployment');
    await user.click(screen.getByRole('button', { name: 'End Deployment' }));

    expect(await screen.findByText('Could not end deployment. Please try again.')).toBeInTheDocument();
    expect(onDeploymentChange).not.toHaveBeenCalled();
    expect(screen.getByText('Active Deployment')).toBeInTheDocument();
  });
});
