import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockGetAllReadingsRange = vi.fn();
const mockGetChartSamples = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getAllReadingsRange: (...args: unknown[]) => mockGetAllReadingsRange(...args),
  getChartSamples: (...args: unknown[]) => mockGetChartSamples(...args),
  celsiusToFahrenheit: (c: number) => c * 9 / 5 + 32,
}));

vi.mock('@/contexts/DevicesContext', () => ({
  useDevices: () => ({
    devices: [
      { id: 'node1', display_name: 'Node 1', color: '#000', is_active: true, monitor_enabled: true, sort_order: 1, created_at: '', updated_at: '' },
    ],
  }),
}));

import { ExportModal } from '../ExportModal';

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  defaultStart: '2024-01-01T00:00',
  defaultEnd: '2024-01-02T00:00',
  defaultDeviceId: '',
};

describe('ExportModal', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock URL.createObjectURL and createElement for download
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:url'), revokeObjectURL: vi.fn() });
  });

  it('renders nothing when closed', () => {
    const { container } = render(<ExportModal {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('shows date range inputs', () => {
    render(<ExportModal {...defaultProps} />);
    expect(screen.getByText('Date Range')).toBeInTheDocument();
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
  });

  it('shows data mode toggle', () => {
    render(<ExportModal {...defaultProps} />);
    expect(screen.getByText('Raw Readings')).toBeInTheDocument();
    expect(screen.getByText('Aggregated')).toBeInTheDocument();
  });

  it('shows bucket size selector in aggregated mode', async () => {
    render(<ExportModal {...defaultProps} />);
    await user.click(screen.getByText('Aggregated'));
    expect(screen.getByText('Bucket Size')).toBeInTheDocument();
  });

  it('shows device filter populated from devices', () => {
    render(<ExportModal {...defaultProps} />);
    expect(screen.getByText('All Devices')).toBeInTheDocument();
    expect(screen.getByText('Node 1')).toBeInTheDocument();
  });

  it('shows weather checkbox', () => {
    render(<ExportModal {...defaultProps} />);
    expect(screen.getByText('Include weather station data')).toBeInTheDocument();
  });

  it('exports raw CSV successfully', async () => {
    const readings = [
      { id: 1, device_id: 'node1', temperature: 20, humidity: 45, created_at: '2024-01-01T12:00:00Z', source: 'sensor' },
    ];
    mockGetAllReadingsRange.mockResolvedValue(readings);
    const onClose = vi.fn();

    render(<ExportModal {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByText('Export CSV'));

    await waitFor(() => {
      expect(mockGetAllReadingsRange).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('shows error when no data found', async () => {
    mockGetAllReadingsRange.mockResolvedValue([]);
    render(<ExportModal {...defaultProps} />);
    await user.click(screen.getByText('Export CSV'));

    await waitFor(() => {
      expect(screen.getByText('No data found for the selected range.')).toBeInTheDocument();
    });
  });

  it('cancel button calls onClose', async () => {
    const onClose = vi.fn();
    render(<ExportModal {...defaultProps} onClose={onClose} />);
    await user.click(screen.getByText('Cancel'));
    expect(onClose).toHaveBeenCalled();
  });
});
