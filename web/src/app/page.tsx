'use client';

import { useEffect, useState, useCallback } from 'react';
import { LiveReadingCard } from '@/components/LiveReadingCard';
import { DeploymentModal } from '@/components/DeploymentModal';
import { DeviceManager } from '@/components/DeviceManager';
import { UserManager } from '@/components/UserManager';
import { Reading, Deployment, ChartSample, DeviceStats, DeviceAlertState, getActiveDeployments, getDashboardLive, getDeviceStats, getDeviceAlertStates } from '@/lib/supabase';
import { guestGetDashboardLive, guestGetDeviceStats, guestGetActiveDeployments, guestGetDeviceAlertStates } from '@/lib/supabase/guestQueries';
import { DashboardStats } from '@/components/DashboardStats';

import { useSetChatPageContext } from '@/lib/chatContext';
import { REFRESH_INTERVAL, STALE_THRESHOLD_MS } from '@/lib/constants';
import { useDevices } from '@/contexts/DevicesContext';
import { PageLayout } from '@/components/PageLayout';
import { ViewportScaler } from '@/components/ViewportScaler';
import { useSession } from '@/components/AuthProvider';
import { useGuest } from '@/contexts/GuestContext';

function gridColsFor(count: number): string {
  if (count <= 1) return 'grid-cols-1';
  if (count === 2) return 'grid-cols-1 md:grid-cols-2';
  if (count === 3) return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
  return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';
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
  const [alertStates, setAlertStates] = useState<DeviceAlertState[]>([]);
  const [alertDismissed, setAlertDismissed] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<{ id: string; name: string } | null>(null);
  const [showDeviceManager, setShowDeviceManager] = useState(false);
  const [showUserManager, setShowUserManager] = useState(false);
  const { role } = useSession();
  const { isGuest } = useGuest();

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

    const fetchLive = isGuest ? guestGetDashboardLive : getDashboardLive;
    const fetchStats = isGuest ? guestGetDeviceStats : getDeviceStats;

    const [liveResult, statsResult] = await Promise.allSettled([
      fetchLive(ids, sixHoursAgo, 15),
      fetchStats({ start: twentyFourHoursAgo, end: now }),
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
  }, [devices, isGuest]);

  const fetchInitialData = useCallback(async () => {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const ids = devices.map(d => d.id);
    const now = new Date().toISOString();
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const fetchLive = isGuest ? guestGetDashboardLive : getDashboardLive;
    const fetchStats = isGuest ? guestGetDeviceStats : getDeviceStats;
    const fetchDeps = isGuest ? guestGetActiveDeployments : getActiveDeployments;
    const fetchAlerts = isGuest ? guestGetDeviceAlertStates : getDeviceAlertStates;

    const [liveResult, statsResult, deploymentsResult, alertResult] = await Promise.allSettled([
      fetchLive(ids, sixHoursAgo, 15),
      fetchStats({ start: twentyFourHoursAgo, end: now }),
      fetchDeps(ids),
      fetchAlerts(ids),
    ]);

    const live = liveResult.status === 'fulfilled' ? liveResult.value : null;
    const deployments = deploymentsResult.status === 'fulfilled' ? deploymentsResult.value : {};
    if (alertResult.status === 'fulfilled') setAlertStates(alertResult.value);

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
  }, [devices, isGuest]);

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
    const fetchDeps = isGuest ? guestGetActiveDeployments : getActiveDeployments;
    const deployments = await fetchDeps(ids);
    setDeviceData(prev => {
      const next = { ...prev };
      for (const id of Object.keys(deployments)) {
        next[id] = { ...next[id], deployment: deployments[id] };
      }
      return next;
    });
  }, [devices, isGuest]);

  const selectedReading = selectedDevice ? deviceData[selectedDevice.id]?.reading : null;
  const selectedDeviceConnected =
    selectedReading && lastRefresh
      ? lastRefresh.getTime() - new Date(selectedReading.created_at).getTime() < STALE_THRESHOLD_MS
      : false;

  return (
    <PageLayout title="Dashboard" onManageNodes={() => setShowDeviceManager(true)}>
      <ViewportScaler ready={!isLoading}>
      {isLoading ? (
        <div className="flex items-center justify-center py-32">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 bg-[var(--foreground-secondary)] rounded-full" style={{ animation: 'dotPulse 1.4s ease-in-out infinite' }} />
            <span className="text-sm sm:text-lg text-[var(--foreground-muted)]">Loading dashboard...</span>
          </div>
        </div>
      ) : (
      <>
      {!isGuest && (
      <div className="hidden sm:flex justify-end mb-12 gap-2">
        {role === 'admin' && (
          <button
            onClick={() => setShowUserManager(true)}
            className="btn-glass px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors flex items-center gap-1.5 sm:gap-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Manage Users
          </button>
        )}
        <button
          onClick={() => setShowDeviceManager(true)}
          className="btn-glass px-3 py-1.5 sm:px-4 sm:py-2 text-xs sm:text-sm text-[var(--foreground-muted)] hover:text-[var(--primary)] transition-colors flex items-center gap-1.5 sm:gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Manage Nodes
        </button>
      </div>
      )}

      {!alertDismissed && (() => {
        const problems = alertStates.filter(a => a.status !== 'ok');
        if (problems.length === 0) return null;
        const deviceNames = problems.map(p => {
          const dev = devices.find(d => d.id === p.device_id);
          return dev?.display_name ?? p.device_id;
        });
        return (
          <div className="flex items-center justify-between py-3 px-4 mb-4 border-l-2" style={{ borderLeftColor: 'var(--error)' }}>
            <div className="flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span className="text-sm text-[var(--fg)]">
                {problems.length === 1
                  ? `${deviceNames[0]} needs attention (${problems[0].status})`
                  : `${problems.length} devices need attention: ${deviceNames.join(', ')}`}
              </span>
            </div>
            <button onClick={() => setAlertDismissed(true)} className="text-[var(--fg-muted)] hover:text-[var(--fg)] p-1" aria-label="Dismiss alert">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        );
      })()}

      {devices.length === 0 ? (
        <div className="py-12">
          <h2 className="text-xl font-semibold text-[var(--fg)] mb-2">No devices configured yet</h2>
          <p className="text-sm text-[var(--fg-muted)] mb-4">Register a sensor node to start streaming readings.</p>
          <button
            onClick={() => setShowDeviceManager(true)}
            className="btn-glass px-4 py-2 text-sm"
          >
            Add your first node
          </button>
        </div>
      ) : (
        <div className={`grid ${gridColsFor(devices.length)} gap-6 sm:gap-8`}>
          {devices.map((device) => (
            <div key={device.id} className="px-5 py-6 min-w-0">
              <LiveReadingCard
                deviceId={device.id}
                deviceName={device.display_name}
                reading={deviceData[device.id]?.reading}
                activeDeployment={deviceData[device.id]?.deployment}
                isLoading={isLoading}
                onClick={isGuest ? undefined : () => setSelectedDevice({ id: device.id, name: device.display_name })}
                onRefresh={() => void fetchLiveAndStats()}
                lastRefresh={lastRefresh}
                weatherReading={deviceData[device.id]?.weather}
                sparklineData={deviceData[device.id]?.sparkline}
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-10">
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--fg)] mb-6">24h Overview</h2>
        <DashboardStats stats={stats} loading={statsLoading} deployments={Object.fromEntries(devices.map(d => [d.id, deviceData[d.id]?.deployment ?? null]))} />
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
      {role === 'admin' && (
        <UserManager isOpen={showUserManager} onClose={() => setShowUserManager(false)} />
      )}
    </PageLayout>
  );
}
