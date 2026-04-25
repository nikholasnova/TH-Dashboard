import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/contexts/DevicesContext', () => ({
  useDevices: () => ({
    devices: [
      { id: 'node1', display_name: 'Node 1', color: '#000', is_active: true, monitor_enabled: true, sort_order: 1, created_at: '', updated_at: '' },
      { id: 'node2', display_name: 'Node 2', color: '#fff', is_active: true, monitor_enabled: true, sort_order: 2, created_at: '', updated_at: '' },
    ],
  }),
}));

import { DeviceDeploymentFilter } from '../DeviceDeploymentFilter';

const mockDeployments = [
  { id: 1, name: 'Patio', device_id: 'node1', location: 'Backyard', notes: null, zip_code: null, owner_id: null, started_at: '2024-01-01', ended_at: null, created_at: '2024-01-01', reading_count: 100 },
  { id: 2, name: 'Kitchen', device_id: 'node2', location: 'Indoor', notes: null, zip_code: null, owner_id: null, started_at: '2024-01-01', ended_at: null, created_at: '2024-01-01', reading_count: 50 },
];

describe('DeviceDeploymentFilter', () => {
  it('renders device select with options', () => {
    render(
      <DeviceDeploymentFilter
        deviceFilter=""
        deploymentFilter=""
        deployments={mockDeployments}
        onDeviceChange={vi.fn()}
        onDeploymentChange={vi.fn()}
      />
    );
    expect(screen.getByText('All devices')).toBeInTheDocument();
    expect(screen.getByText('Node 1')).toBeInTheDocument();
    expect(screen.getByText('Node 2')).toBeInTheDocument();
  });

  it('renders deployment select with options', () => {
    render(
      <DeviceDeploymentFilter
        deviceFilter=""
        deploymentFilter=""
        deployments={mockDeployments}
        onDeviceChange={vi.fn()}
        onDeploymentChange={vi.fn()}
      />
    );
    expect(screen.getByText('All deployments')).toBeInTheDocument();
    expect(screen.getByText('Patio (node1)')).toBeInTheDocument();
    expect(screen.getByText('Kitchen (node2)')).toBeInTheDocument();
  });

  it('calls onDeviceChange when device select changes', () => {
    const onDeviceChange = vi.fn();
    render(
      <DeviceDeploymentFilter
        deviceFilter=""
        deploymentFilter=""
        deployments={mockDeployments}
        onDeviceChange={onDeviceChange}
        onDeploymentChange={vi.fn()}
      />
    );
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'node1' } });
    expect(onDeviceChange).toHaveBeenCalledWith('node1');
  });

  it('filters deployments by selected device', () => {
    render(
      <DeviceDeploymentFilter
        deviceFilter="node1"
        deploymentFilter=""
        deployments={mockDeployments}
        onDeviceChange={vi.fn()}
        onDeploymentChange={vi.fn()}
      />
    );
    expect(screen.getByText('Patio (node1)')).toBeInTheDocument();
    expect(screen.queryByText('Kitchen (node2)')).not.toBeInTheDocument();
  });
});
