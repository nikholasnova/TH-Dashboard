import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockCreateDevice = vi.fn();
const mockUpdateDevice = vi.fn();
const mockRefresh = vi.fn();

const mockDevices = [
  { id: 'node1', display_name: 'Node 1', color: '#374151', is_active: true, monitor_enabled: true, sort_order: 1, created_at: '', updated_at: '' },
  { id: 'node2', display_name: 'Node 2', color: '#16a34a', is_active: false, monitor_enabled: false, sort_order: 2, created_at: '', updated_at: '' },
];

vi.mock('@/lib/supabase', () => ({
  createDevice: (...args: unknown[]) => mockCreateDevice(...args),
  updateDevice: (...args: unknown[]) => mockUpdateDevice(...args),
}));

vi.mock('@/contexts/DevicesContext', () => ({
  useDevices: () => ({
    allDevices: mockDevices,
    refresh: mockRefresh,
  }),
}));

import { DeviceManager } from '../DeviceManager';

describe('DeviceManager', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    mockRefresh.mockResolvedValue(undefined);
  });

  it('renders nothing when closed', () => {
    const { container } = render(<DeviceManager isOpen={false} onClose={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders device list when open', () => {
    render(<DeviceManager isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('Node 1')).toBeInTheDocument();
    expect(screen.getByText('Node 2')).toBeInTheDocument();
    expect(screen.getByText('node1')).toBeInTheDocument();
    expect(screen.getByText('node2')).toBeInTheDocument();
  });

  it('edit flow: saves name change', async () => {
    mockUpdateDevice.mockResolvedValue({ id: 'node1', display_name: 'Updated' });
    render(<DeviceManager isOpen={true} onClose={vi.fn()} />);

    const editButtons = screen.getAllByTitle('Edit');
    await user.click(editButtons[0]);

    const nameInput = screen.getByDisplayValue('Node 1');
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Name');
    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(mockUpdateDevice).toHaveBeenCalledWith('node1', expect.objectContaining({
        display_name: 'Updated Name',
      }));
    });
    expect(mockRefresh).toHaveBeenCalled();
  });

  it('edit flow: cancel resets form', async () => {
    render(<DeviceManager isOpen={true} onClose={vi.fn()} />);

    const editButtons = screen.getAllByTitle('Edit');
    await user.click(editButtons[0]);
    expect(screen.getByDisplayValue('Node 1')).toBeInTheDocument();

    await user.click(screen.getByText('Cancel'));
    expect(screen.queryByDisplayValue('Node 1')).not.toBeInTheDocument();
  });

  it('deactivate flow: shows confirmation then deactivates', async () => {
    mockUpdateDevice.mockResolvedValue({});
    render(<DeviceManager isOpen={true} onClose={vi.fn()} />);

    const toggles = screen.getAllByTitle('Deactivate');
    await user.click(toggles[0]);

    expect(screen.getByText('Yes, Deactivate')).toBeInTheDocument();

    await user.click(screen.getByText('Yes, Deactivate'));

    await waitFor(() => {
      expect(mockUpdateDevice).toHaveBeenCalledWith('node1', { is_active: false, monitor_enabled: false });
    });
  });

  it('reactivate calls updateDevice with is_active: true', async () => {
    mockUpdateDevice.mockResolvedValue({});
    render(<DeviceManager isOpen={true} onClose={vi.fn()} />);

    const activateButton = screen.getByTitle('Activate');
    await user.click(activateButton);

    await waitFor(() => {
      expect(mockUpdateDevice).toHaveBeenCalledWith('node2', { is_active: true, monitor_enabled: true });
    });
  });

  it('add device: valid ID calls createDevice', async () => {
    mockCreateDevice.mockResolvedValue({ id: 'node3' });
    render(<DeviceManager isOpen={true} onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('e.g., node3'), 'node3');
    await user.type(screen.getByPlaceholderText('e.g., Node 3'), 'Node Three');
    const addBtn = screen.getByRole('button', { name: 'Add Device' });
    await user.click(addBtn);

    await waitFor(() => {
      expect(mockCreateDevice).toHaveBeenCalledWith(expect.objectContaining({
        id: 'node3',
        display_name: 'Node Three',
      }));
    });
  });

  it('add device: invalid ID shows validation message', async () => {
    render(<DeviceManager isOpen={true} onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('e.g., node3'), 'INVALID!');
    expect(screen.getByText(/Only lowercase letters/)).toBeInTheDocument();
  });

  it('add device: duplicate ID shows error on submit', async () => {
    render(<DeviceManager isOpen={true} onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText('e.g., node3'), 'node1');
    await user.type(screen.getByPlaceholderText('e.g., Node 3'), 'Dup');
    await user.click(screen.getByRole('button', { name: 'Add Device' }));

    expect(screen.getByText(/already exists/)).toBeInTheDocument();
  });

  it('overlay click calls onClose', async () => {
    const onClose = vi.fn();
    render(<DeviceManager isOpen={true} onClose={onClose} />);

    const overlay = document.querySelector('.backdrop-blur-sm')!;
    await user.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('edit error displays message', async () => {
    mockUpdateDevice.mockRejectedValue(new Error('Update failed'));
    render(<DeviceManager isOpen={true} onClose={vi.fn()} />);

    const editButtons = screen.getAllByTitle('Edit');
    await user.click(editButtons[0]);
    await user.click(screen.getByText('Save'));

    await waitFor(() => {
      expect(screen.getByText('Update failed')).toBeInTheDocument();
    });
  });
});
