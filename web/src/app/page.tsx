'use client';

import { useEffect, useState, useCallback } from 'react';
import { LiveReadingCard } from '@/components/LiveReadingCard';
import { AIChat } from '@/components/AIChat';
import { DeploymentModal } from '@/components/DeploymentModal';
import { Reading, Deployment, getLatestReading, getActiveDeployment } from '@/lib/supabase';
import Link from 'next/link';

const DEVICES = [
  { id: 'node1', name: 'Node 1' },
  { id: 'node2', name: 'Node 2' },
];

const REFRESH_INTERVAL = 30000; // 30 seconds

export default function Dashboard() {
  const [readings, setReadings] = useState<Record<string, Reading | null>>({});
  const [deployments, setDeployments] = useState<Record<string, Deployment | null>>({});
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDevice, setSelectedDevice] = useState<{ id: string; name: string } | null>(null);

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

  useEffect(() => {
    fetchReadings();
    fetchDeployments();
    const interval = setInterval(fetchReadings, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchReadings, fetchDeployments]);

  const handleDeploymentChange = () => {
    fetchDeployments();
  };

  return (
    <div className="min-h-screen">
      <div className="container-responsive">
        {/* Header */}
        <header className="mb-10">
          <h1 className="text-4xl font-bold text-white mb-2">
            Dashboard
          </h1>
          <p className="text-lg text-[#a0aec0]">
            Real-time temperature & humidity monitoring
          </p>
        </header>

        {/* Navigation */}
        <nav className="glass-card p-2 mb-10 inline-flex gap-2">
          <Link
            href="/"
            className="nav-active px-6 py-3 text-white text-sm font-semibold"
          >
            Live
          </Link>
          <Link
            href="/charts"
            className="px-6 py-3 text-[#a0aec0] hover:text-white rounded-xl text-sm font-medium transition-colors"
          >
            Charts
          </Link>
          <Link
            href="/compare"
            className="px-6 py-3 text-[#a0aec0] hover:text-white rounded-xl text-sm font-medium transition-colors"
          >
            Compare
          </Link>
          <Link
            href="/deployments"
            className="px-6 py-3 text-[#a0aec0] hover:text-white rounded-xl text-sm font-medium transition-colors"
          >
            Deployments
          </Link>
        </nav>

        {/* Live Readings */}
        <div className="grid lg:grid-cols-2 gap-8">
          {DEVICES.map((device) => (
            <div key={device.id}>
              {isLoading ? (
                <div className="glass-card p-8 card-reading">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <div className="skeleton h-8 w-28 mb-2"></div>
                      <div className="skeleton h-4 w-16"></div>
                    </div>
                    <div className="skeleton h-6 w-14 rounded-full"></div>
                  </div>
                  <div className="grid grid-cols-2 gap-8 mb-8">
                    <div className="glass-card p-6 !rounded-xl !border-white/10">
                      <div className="skeleton h-4 w-24 mb-3"></div>
                      <div className="skeleton h-10 w-28 mb-2"></div>
                      <div className="skeleton h-4 w-16"></div>
                    </div>
                    <div className="glass-card p-6 !rounded-xl !border-white/10">
                      <div className="skeleton h-4 w-20 mb-3"></div>
                      <div className="skeleton h-10 w-24"></div>
                    </div>
                  </div>
                  <div className="skeleton h-4 w-36"></div>
                </div>
              ) : (
                <div className="fade-in">
                  <LiveReadingCard
                    deviceId={device.id}
                    deviceName={device.name}
                    reading={readings[device.id]}
                    activeDeployment={deployments[device.id]}
                    onClick={() => setSelectedDevice(device)}
                    onRefresh={fetchReadings}
                    lastRefresh={lastRefresh}
                  />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* AI Chat */}
        <div className="mt-10">
          <AIChat />
        </div>
      </div>

      {/* Deployment Modal */}
      {selectedDevice && (
        <DeploymentModal
          deviceId={selectedDevice.id}
          deviceName={selectedDevice.name}
          isOpen={!!selectedDevice}
          onClose={() => setSelectedDevice(null)}
          onDeploymentChange={handleDeploymentChange}
        />
      )}
    </div>
  );
}
