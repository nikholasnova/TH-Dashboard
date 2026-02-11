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

interface DeviceData {
  reading: Reading | null;
  deployment: Deployment | null;
  weather: Reading | null;
  sparkline: ChartSample[];
}

const emptyDevice: DeviceData = { reading: null, deployment: null, weather: null, sparkline: [] };

export default function Dashboard() {
  const [deviceData, setDeviceData] = useState<Record<string, DeviceData>>(() =>
    Object.fromEntries(DEVICES.map(d => [d.id, emptyDevice]))
  );
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<{ id: string; name: string } | null>(null);

  const setPageContext = useSetChatPageContext();
  useEffect(() => {
    setPageContext({ page: 'dashboard' });
    return () => setPageContext({});
  }, [setPageContext]);

  const fetchLiveData = useCallback(async () => {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const updates: Record<string, Partial<DeviceData>> = {};

    await Promise.all(
      DEVICES.flatMap((device) => [
        getLatestReading(device.id).then(r => { updates[device.id] = { ...updates[device.id], reading: r }; }),
        getLatestReading(`weather_${device.id}`).then(r => { updates[device.id] = { ...updates[device.id], weather: r }; }),
        getChartSamples({ start: sixHoursAgo, end: now, bucketSeconds: 900, device_id: device.id })
          .then(s => { updates[device.id] = { ...updates[device.id], sparkline: s }; }),
      ])
    );

    setDeviceData(prev => {
      const next = { ...prev };
      for (const id of Object.keys(updates)) {
        next[id] = { ...next[id], ...updates[id] };
      }
      return next;
    });
    setLastRefresh(new Date());
    setIsLoading(false);
  }, []);

  const fetchDeployments = useCallback(async () => {
    const updates: Record<string, Deployment | null> = {};

    await Promise.all(
      DEVICES.map(async (device) => {
        updates[device.id] = await getActiveDeployment(device.id);
      })
    );

    setDeviceData(prev => {
      const next = { ...prev };
      for (const id of Object.keys(updates)) {
        next[id] = { ...next[id], deployment: updates[id] };
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const initialTimer = setTimeout(() => {
      void fetchLiveData();
      void fetchDeployments();
    }, 0);
    const interval = setInterval(() => {
      void fetchLiveData();
    }, REFRESH_INTERVAL);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [fetchLiveData, fetchDeployments]);

  const handleDeploymentChange = () => {
    fetchDeployments();
  };

  const selectedReading = selectedDevice ? deviceData[selectedDevice.id]?.reading : null;
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
            reading={deviceData[device.id]?.reading}
            activeDeployment={deviceData[device.id]?.deployment}
            isLoading={isLoading}
            onClick={() => setSelectedDevice(device)}
            onRefresh={fetchLiveData}
            lastRefresh={lastRefresh}
            weatherReading={deviceData[device.id]?.weather}
            sparklineData={deviceData[device.id]?.sparkline}
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
