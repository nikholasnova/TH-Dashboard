import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LiveReadingCard } from '../LiveReadingCard';

const baseReading = {
  id: 1,
  device_id: 'node1',
  temperature: 20,
  humidity: 45.2,
  created_at: new Date().toISOString(),
};

describe('LiveReadingCard', () => {
  it('renders temperature and humidity values', () => {
    render(
      <LiveReadingCard
        deviceId="node1"
        deviceName="Node 1"
        reading={baseReading}
        isLoading={false}
      />
    );

    expect(screen.getByText('68.0')).toBeInTheDocument();
    expect(screen.getByText('45.2')).toBeInTheDocument();
  });

  it('renders loading state when no reading and loading', () => {
    render(
      <LiveReadingCard
        deviceId="node1"
        deviceName="Node 1"
        reading={null}
        isLoading={true}
      />
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
