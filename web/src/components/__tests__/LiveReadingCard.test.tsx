import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiveReadingCard } from '../LiveReadingCard';

const freshTimestamp = new Date().toISOString();
const staleTimestamp = new Date(Date.now() - 10 * 60 * 1000).toISOString(); // 10 min ago

const baseReading = {
  id: 1,
  device_id: 'node1',
  temperature: 20,
  humidity: 45.2,
  created_at: freshTimestamp,
};

const staleReading = {
  ...baseReading,
  created_at: staleTimestamp,
};

const weatherReading = {
  id: 2,
  device_id: 'weather_node1',
  temperature: 21,
  humidity: 48,
  created_at: freshTimestamp,
  source: 'weather' as const,
};

const deployment = {
  id: 1,
  device_id: 'node1',
  name: 'Patio Setup',
  location: 'Backyard',
  notes: null,
  zip_code: null,
  started_at: '2024-01-01T00:00:00Z',
  ended_at: null,
  created_at: '2024-01-01T00:00:00Z',
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
    const { container } = render(
      <LiveReadingCard
        deviceId="node1"
        deviceName="Node 1"
        reading={null}
        isLoading={true}
      />
    );

    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows live indicator with updated timestamp when reading is fresh', () => {
    const { container } = render(
      <LiveReadingCard
        deviceId="node1"
        deviceName="Node 1"
        reading={baseReading}
      />
    );
    expect(container.querySelector('.live-indicator')).toBeInTheDocument();
    expect(screen.getByText(/Updated/)).toBeInTheDocument();
  });

  it('shows Offline badge when reading is stale', () => {
    render(
      <LiveReadingCard
        deviceId="node1"
        deviceName="Node 1"
        reading={staleReading}
        lastRefresh={new Date()}
      />
    );
    expect(screen.getByText('Offline')).toBeInTheDocument();
  });

  it('shows Device Offline with last seen time for stale reading', () => {
    render(
      <LiveReadingCard
        deviceId="node1"
        deviceName="Node 1"
        reading={staleReading}
        lastRefresh={new Date()}
      />
    );
    expect(screen.getByText('Device Offline')).toBeInTheDocument();
    expect(screen.getByText(/Last seen/)).toBeInTheDocument();
  });

  it('shows stale reading values dimmed', () => {
    render(
      <LiveReadingCard
        deviceId="node1"
        deviceName="Node 1"
        reading={staleReading}
        lastRefresh={new Date()}
      />
    );
    expect(screen.getByText('68.0°F')).toBeInTheDocument();
    expect(screen.getByText('45.2%')).toBeInTheDocument();
  });

  it('shows "No data available" when no reading and not loading', () => {
    render(
      <LiveReadingCard
        deviceId="node1"
        deviceName="Node 1"
        reading={null}
        isLoading={false}
      />
    );
    expect(screen.getByText('No data available')).toBeInTheDocument();
  });

  it('shows deployment name when activeDeployment provided', () => {
    render(
      <LiveReadingCard
        deviceId="node1"
        deviceName="Node 1"
        reading={baseReading}
        activeDeployment={deployment}
      />
    );
    expect(screen.getByText('Patio Setup')).toBeInTheDocument();
  });

  it('shows "No Active Deployment" when no deployment', () => {
    render(
      <LiveReadingCard
        deviceId="node1"
        deviceName="Node 1"
        reading={baseReading}
        activeDeployment={null}
      />
    );
    expect(screen.getByText('No Active Deployment')).toBeInTheDocument();
  });

  it('shows weather comparison elements', () => {
    const { container } = render(
      <LiveReadingCard
        deviceId="node1"
        deviceName="Node 1"
        reading={baseReading}
        weatherReading={weatherReading}
        lastRefresh={new Date()}
      />
    );
    // The weather comparison uses hidden sm:block, so query the DOM directly
    const weatherTexts = container.querySelectorAll('[class*="sm:block"]');
    const hasWeatherComparison = Array.from(weatherTexts).some(el => el.textContent?.includes('vs Official'));
    expect(hasWeatherComparison).toBe(true);
  });

  it('does not render sparkline with insufficient data', () => {
    const sparklineData = [
      { bucket_ts: '2024-01-01T00:00:00Z', device_id: 'node1', temperature_avg: 20, humidity_avg: 45, reading_count: 12 },
    ];
    const { container } = render(
      <LiveReadingCard
        deviceId="node1"
        deviceName="Node 1"
        reading={baseReading}
        sparklineData={sparklineData}
      />
    );
    // With only 1 data point, Sparkline returns null
    expect(container.querySelector('.sparkline-animate')).not.toBeInTheDocument();
  });

  it('refresh button calls onRefresh', async () => {
    const onRefresh = vi.fn();
    const user = userEvent.setup();
    render(
      <LiveReadingCard
        deviceId="node1"
        deviceName="Node 1"
        reading={baseReading}
        onRefresh={onRefresh}
      />
    );

    await user.click(screen.getByTitle(/Refresh/));
    expect(onRefresh).toHaveBeenCalled();
  });

  it('does not show refresh button when onRefresh is not provided', () => {
    render(
      <LiveReadingCard
        deviceId="node1"
        deviceName="Node 1"
        reading={baseReading}
      />
    );
    expect(screen.queryByTitle(/Refresh/)).not.toBeInTheDocument();
  });
});
