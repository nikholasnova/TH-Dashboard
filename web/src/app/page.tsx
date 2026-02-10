'use client';

import { useEffect, useState, useCallback } from 'react';
import { LiveReadingCard } from '@/components/LiveReadingCard';
import { DeploymentModal } from '@/components/DeploymentModal';
import { Reading, Deployment, ChartSample, getLatestReading, getActiveDeployment, getChartSamples } from '@/lib/supabase';
import { DashboardStats } from '@/components/DashboardStats';
import { DashboardForecast } from '@/components/DashboardForecast';
import { useSetChatPageContext } from '@/lib/chatContext';
import { DEVICES, REFRESH_INTERVAL, STALE_THRESHOLD_MS } from '@/lib/constants';
import { PageLayout } from '@/components/PageLayout';

export default function Dashboard() {
  const [readings, setReadings] = useState<Record<string, Reading | null>>({});
  const [deployments, setDeployments] = useState<Record<string, Deployment | null>>({});
  const [weatherReadings, setWeatherReadings] = useState<Record<string, Reading | null>>({});
  const [sparklineData, setSparklineData] = useState<Record<string, ChartSample[]>>({});
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<{ id: string; name: string } | null>(null);

  const setPageContext = useSetChatPageContext();
  useEffect(() => {
    setPageContext({ page: 'dashboard' });
    return () => setPageContext({});
  }, [setPageContext]);

  const fetchReadings = useCallback(async () => {
    const results: Record<string, Reading | null> = {};

    await Promise.all(
      DEVICES.map(async (device) => {
        results[device.id] = await getLatestReading(device.id);
      })
    );

    setReadings(results);
    setLastRefresh(new Date());
    setIsLoading(false);
  }, []);

  const fetchDeployments = useCallback(async () => {
    const results: Record<string, Deployment | null> = {};

    await Promise.all(
      DEVICES.map(async (device) => {
        results[device.id] = await getActiveDeployment(device.id);
      })
    );

    setDeployments(results);
  }, []);

  const fetchWeatherAndSparkline = useCallback(async () => {
    const weather: Record<string, Reading | null> = {};
    const sparklines: Record<string, ChartSample[]> = {};
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    await Promise.all([
      ...DEVICES.map(async (device) => {
        weather[device.id] = await getLatestReading(`weather_${device.id}`);
      }),
      ...DEVICES.map(async (device) => {
        sparklines[device.id] = await getChartSamples({
          start: sixHoursAgo,
          end: now,
          bucketSeconds: 900,
          device_id: device.id,
        });
      }),
    ]);

    setWeatherReadings(weather);
    setSparklineData(sparklines);
  }, []);

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      void fetchReadings();
      void fetchDeployments();
      void fetchWeatherAndSparkline();
    }, 0);
    const interval = setInterval(() => {
      void fetchReadings();
      void fetchWeatherAndSparkline();
    }, REFRESH_INTERVAL);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [fetchReadings, fetchDeployments, fetchWeatherAndSparkline]);

  const handleDeploymentChange = () => {
    fetchDeployments();
  };

  const selectedReading = selectedDevice ? readings[selectedDevice.id] : null;
  const selectedDeviceConnected =
    selectedReading && lastRefresh
      ? lastRefresh.getTime() - new Date(selectedReading.created_at).getTime() < STALE_THRESHOLD_MS
      : false;

  return (
    <PageLayout title="Dashboard" subtitle="Real-time temperature & humidity monitoring">
      <div className="grid lg:grid-cols-2 gap-8">
        {DEVICES.map((device) => (
          <LiveReadingCard
            key={device.id}
            deviceId={device.id}
            deviceName={device.name}
            reading={readings[device.id]}
            activeDeployment={deployments[device.id]}
            isLoading={isLoading}
            onClick={() => setSelectedDevice(device)}
            onRefresh={fetchReadings}
            lastRefresh={lastRefresh}
            weatherReading={weatherReadings[device.id]}
            sparklineData={sparklineData[device.id]}
          />
        ))}
      </div>

      <DashboardStats />

      <DashboardForecast />

      {selectedDevice && (
        <DeploymentModal
          deviceId={selectedDevice.id}
          deviceName={selectedDevice.name}
          reading={selectedReading}
          isDeviceConnected={selectedDeviceConnected}
          isOpen={!!selectedDevice}
          onClose={() => setSelectedDevice(null)}
          onDeploymentChange={handleDeploymentChange}
        />
      )}
    </PageLayout>
  );
}
