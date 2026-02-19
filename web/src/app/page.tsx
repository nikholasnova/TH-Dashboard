'use client';

import { useEffect, useState, useCallback } from 'react';
import { LiveReadingCard } from '@/components/LiveReadingCard';
import { DeploymentModal } from '@/components/DeploymentModal';
import { DeviceManager } from '@/components/DeviceManager';
import { Reading, Deployment, ChartSample, getActiveDeployment, getDashboardLive } from '@/lib/supabase';
import { DashboardStats } from '@/components/DashboardStats';
import { DashboardForecast } from '@/components/DashboardForecast';
import { useSetChatPageContext } from '@/lib/chatContext';
import { REFRESH_INTERVAL, STALE_THRESHOLD_MS } from '@/lib/constants';
import { useDevices } from '@/contexts/DevicesContext';
import { PageLayout } from '@/components/PageLayout';

function getGridClasses(count: number): string {
  if (count <= 1) return 'grid-cols-1 max-w-2xl mx-auto';
  if (count === 2) return 'grid-cols-1 md:grid-cols-2';
  if (count === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
  return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';
}

interface DeviceData {
  reading: Reading | null;
  deployment: Deployment | null;
  weather: Reading | null;
  sparkline: ChartSample[];
}

const emptyDevice: DeviceData = { reading: null, deployment: null, weather: null, sparkline: [] };

export default function Dashboard() {
  const { devices } = useDevices();
  const [deviceData, setDeviceData] = useState<Record<string, DeviceData>>(() =>
    Object.fromEntries(devices.map(d => [d.id, emptyDevice]))
  );
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<{ id: string; name: string } | null>(null);
  const [showDeviceManager, setShowDeviceManager] = useState(false);

  const setPageContext = useSetChatPageContext();
  useEffect(() => {
    setPageContext({ page: 'dashboard' });
    return () => setPageContext({});
  }, [setPageContext]);

  const fetchLiveData = useCallback(async () => {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const ids = devices.map(d => d.id);
    const live = await getDashboardLive(ids, sixHoursAgo, 15);

    setDeviceData(prev => {
      const next = { ...prev };
      for (const device of devices) {
        next[device.id] = {
          reading: live.sensor[device.id] ?? null,
          weather: live.weather[device.id] ?? null,
          sparkline: live.sparklines[device.id] ?? [],
          deployment: prev[device.id]?.deployment ?? null,
        };
      }
      return next;
    });
    setLastRefresh(new Date());
    setIsLoading(false);
  }, [devices]);

  const fetchDeployments = useCallback(async () => {
    const updates: Record<string, Deployment | null> = {};

    await Promise.all(
      devices.map(async (device) => {
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
  }, [devices]);

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
      <div className="flex justify-end mb-4">
        <button
          onClick={() => setShowDeviceManager(true)}
          className="btn-glass px-3 py-1.5 text-xs text-[#a0aec0] hover:text-white transition-colors flex items-center gap-1.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Manage Nodes
        </button>
      </div>
      <div className={`grid ${getGridClasses(devices.length)} gap-8`}>
        {devices.map((device) => (
          <LiveReadingCard
            key={device.id}
            deviceId={device.id}
            deviceName={device.display_name}
            reading={deviceData[device.id]?.reading}
            activeDeployment={deviceData[device.id]?.deployment}
            isLoading={isLoading}
            onClick={() => setSelectedDevice({ id: device.id, name: device.display_name })}
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
      <DeviceManager isOpen={showDeviceManager} onClose={() => setShowDeviceManager(false)} />
    </PageLayout>
  );
}
