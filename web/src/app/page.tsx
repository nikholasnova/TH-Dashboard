'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { LiveReadingCard } from '@/components/LiveReadingCard';
import { DeploymentModal } from '@/components/DeploymentModal';
import { DeviceManager } from '@/components/DeviceManager';
import { Reading, Deployment, ChartSample, DeviceStats, getActiveDeployments, getDashboardLive, getDeviceStats } from '@/lib/supabase';
import { DashboardStats } from '@/components/DashboardStats';
import { DashboardForecast } from '@/components/DashboardForecast';
import { useSetChatPageContext } from '@/lib/chatContext';
import { REFRESH_INTERVAL, STALE_THRESHOLD_MS } from '@/lib/constants';
import { useDevices } from '@/contexts/DevicesContext';
import { PageLayout } from '@/components/PageLayout';
import { ViewportScaler } from '@/components/ViewportScaler';

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


interface DashboardCache {
  deviceData: Record<string, DeviceData>;
  stats: DeviceStats[];
  lastRefresh: Date | null;
}

let dashboardCache: DashboardCache | null = null;

export default function Dashboard() {
  const { devices, isLoading: devicesLoading } = useDevices();
  const [deviceData, setDeviceData] = useState<Record<string, DeviceData>>(() =>
    dashboardCache?.deviceData ?? Object.fromEntries(devices.map(d => [d.id, emptyDevice]))
  );
  const [lastRefresh, setLastRefresh] = useState<Date | null>(dashboardCache?.lastRefresh ?? null);
  const [isLoading, setIsLoading] = useState(!dashboardCache);
  const [stats, setStats] = useState<DeviceStats[]>(dashboardCache?.stats ?? []);
  const [statsLoading, setStatsLoading] = useState(!dashboardCache);
  const [selectedDevice, setSelectedDevice] = useState<{ id: string; name: string } | null>(null);
  const [showDeviceManager, setShowDeviceManager] = useState(false);

  useEffect(() => {
    return () => { dashboardCache = { deviceData, stats, lastRefresh }; };
  });

  const setPageContext = useSetChatPageContext();
  useEffect(() => {
    setPageContext({ page: 'dashboard' });
    return () => setPageContext({});
  }, [setPageContext]);

  const fetchLiveAndStats = useCallback(async () => {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const ids = devices.map(d => d.id);
    const now = new Date().toISOString();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [liveResult, statsResult] = await Promise.allSettled([
      getDashboardLive(ids, sixHoursAgo, 15),
      getDeviceStats({ start: twentyFourHoursAgo, end: now }),
    ]);

    if (liveResult.status === 'fulfilled') {
      const live = liveResult.value;
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
    }

    if (statsResult.status === 'fulfilled') {
      setStats(statsResult.value);
      setStatsLoading(false);
    }
  }, [devices]);

  const fetchInitialData = useCallback(async () => {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const ids = devices.map(d => d.id);
    const now = new Date().toISOString();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [liveResult, statsResult, deploymentsResult] = await Promise.allSettled([
      getDashboardLive(ids, sixHoursAgo, 15),
      getDeviceStats({ start: twentyFourHoursAgo, end: now }),
      getActiveDeployments(ids),
    ]);

    const live = liveResult.status === 'fulfilled' ? liveResult.value : null;
    const deployments = deploymentsResult.status === 'fulfilled' ? deploymentsResult.value : {};

    setDeviceData(() => {
      const next: Record<string, DeviceData> = {};
      for (const device of devices) {
        next[device.id] = {
          reading: live?.sensor[device.id] ?? null,
          weather: live?.weather[device.id] ?? null,
          sparkline: live?.sparklines[device.id] ?? [],
          deployment: deployments[device.id] ?? null,
        };
      }
      return next;
    });

    if (live) setLastRefresh(new Date());
    if (statsResult.status === 'fulfilled') {
      setStats(statsResult.value);
      setStatsLoading(false);
    }
    setIsLoading(false);
  }, [devices]);

  useEffect(() => {
    if (devicesLoading) return;
    const initialTimer = setTimeout(() => {
      void fetchInitialData();
    }, 0);
    const interval = setInterval(() => {
      void fetchLiveAndStats();
    }, REFRESH_INTERVAL);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [fetchInitialData, fetchLiveAndStats, devicesLoading]);

  const handleDeploymentChange = useCallback(async () => {
    const ids = devices.map(d => d.id);
    const deployments = await getActiveDeployments(ids);
    setDeviceData(prev => {
      const next = { ...prev };
      for (const id of Object.keys(deployments)) {
        next[id] = { ...next[id], deployment: deployments[id] };
      }
      return next;
    });
  }, [devices]);

  const selectedReading = selectedDevice ? deviceData[selectedDevice.id]?.reading : null;
  const selectedDeviceConnected =
    selectedReading && lastRefresh
      ? lastRefresh.getTime() - new Date(selectedReading.created_at).getTime() < STALE_THRESHOLD_MS
      : false;

  return (
    <PageLayout title="Dashboard" subtitle="Real-time temperature & humidity monitoring" onManageNodes={() => setShowDeviceManager(true)}>
      <ViewportScaler ready={!isLoading}>
      {isLoading ? (
        <div className="flex items-center justify-center py-32">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-[var(--foreground-secondary)] rounded-full" style={{ animation: 'dotPulse 1.4s ease-in-out infinite' }} />
            <span className="text-lg text-[var(--foreground-muted)]">Loading dashboard...</span>
          </div>
        </div>
      ) : (
      <>
      <div className="hidden sm:flex justify-end mb-4">
        <button
          onClick={() => setShowDeviceManager(true)}
          className="btn-glass px-5 py-2.5 text-lg text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors flex items-center gap-2.5"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Manage Nodes
        </button>
      </div>

      <p className="section-label">Live Readings</p>
      <div className={`grid ${getGridClasses(devices.length)} gap-4 sm:gap-8`}>
        {devices.map((device) => (
          <motion.div
            key={device.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: [0.4, 0, 0.2, 1] }}
          >
            <LiveReadingCard
              deviceId={device.id}
              deviceName={device.display_name}
              reading={deviceData[device.id]?.reading}
              activeDeployment={deviceData[device.id]?.deployment}
              isLoading={isLoading}
              onClick={() => setSelectedDevice({ id: device.id, name: device.display_name })}
              onRefresh={() => void fetchLiveAndStats()}
              lastRefresh={lastRefresh}
              weatherReading={deviceData[device.id]?.weather}
              sparklineData={deviceData[device.id]?.sparkline}
            />
          </motion.div>
        ))}
      </div>

      <div className="mt-10">
        <p className="section-label">24h Overview</p>
        <DashboardStats stats={stats} loading={statsLoading} />
      </div>

      <div className="mt-10">
        <p className="section-label">Forecast</p>
        <DashboardForecast />
      </div>

      </>
      )}
      </ViewportScaler>

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
