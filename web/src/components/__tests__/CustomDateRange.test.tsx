import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CustomDateRange } from '../CustomDateRange';

describe('CustomDateRange', () => {
  it('renders start and end inputs', () => {
    render(
      <CustomDateRange
        start="2024-01-01T00:00"
        end="2024-01-02T00:00"
        onStartChange={vi.fn()}
        onEndChange={vi.fn()}
        isValid={true}
      />
    );
    expect(screen.getByText('Start')).toBeInTheDocument();
    expect(screen.getByText('End')).toBeInTheDocument();
  });

  it('calls onStartChange when start input changes', () => {
    const onStartChange = vi.fn();
    render(
      <CustomDateRange
        start="2024-01-01T00:00"
        end="2024-01-02T00:00"
        onStartChange={onStartChange}
        onEndChange={vi.fn()}
        isValid={true}
      />
    );
    const inputs = screen.getAllByDisplayValue(/2024/);
    fireEvent.change(inputs[0], { target: { value: '2024-01-01T12:00' } });
    expect(onStartChange).toHaveBeenCalledWith('2024-01-01T12:00');
  });

  it('calls onEndChange when end input changes', () => {
    const onEndChange = vi.fn();
    render(
      <CustomDateRange
        start="2024-01-01T00:00"
        end="2024-01-02T00:00"
        onStartChange={vi.fn()}
        onEndChange={onEndChange}
        isValid={true}
      />
    );
    const inputs = screen.getAllByDisplayValue(/2024/);
    fireEvent.change(inputs[1], { target: { value: '2024-01-03T00:00' } });
    expect(onEndChange).toHaveBeenCalledWith('2024-01-03T00:00');
  });

  it('shows validation message when invalid', () => {
    render(
      <CustomDateRange
        start="2024-01-02T00:00"
        end="2024-01-01T00:00"
        onStartChange={vi.fn()}
        onEndChange={vi.fn()}
        isValid={false}
      />
    );
    expect(screen.getByText('Pick a valid range')).toBeInTheDocument();
  });

  it('hides validation message when valid', () => {
    render(
      <CustomDateRange
        start="2024-01-01T00:00"
        end="2024-01-02T00:00"
        onStartChange={vi.fn()}
        onEndChange={vi.fn()}
        isValid={true}
      />
    );
    expect(screen.queryByText('Pick a valid range')).not.toBeInTheDocument();
  });
});
