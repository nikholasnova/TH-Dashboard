'use client';

import { useEffect, useState, useCallback } from 'react';
import { LiveReadingCard } from '@/components/LiveReadingCard';
import { AIChat } from '@/components/AIChat';
import { DeploymentModal } from '@/components/DeploymentModal';
import { AuthGate } from '@/components/AuthGate';
import { Reading, Deployment, getLatestReading, getActiveDeployment } from '@/lib/supabase';
import { Navbar } from '@/components/Navbar';

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
    <AuthGate>
      <div className="min-h-screen">
        <div className="container-responsive">
          {/* flex-col-reverse puts nav above header on mobile */}
          <div className="flex flex-col-reverse sm:flex-col">
            <header className="mb-6 sm:mb-10">
              <h1 className="text-3xl sm:text-4xl font-bold text-white mb-2">
                Dashboard
              </h1>
              <p className="text-base sm:text-lg text-[#a0aec0]">
                Real-time temperature & humidity monitoring
              </p>
            </header>
            <Navbar />
          </div>

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
              />
            ))}
          </div>

          <div className="mt-10">
            <AIChat />
          </div>
        </div>

        {selectedDevice && (
          <DeploymentModal
            deviceId={selectedDevice.id}
            deviceName={selectedDevice.name}
            reading={readings[selectedDevice.id]}
            isOpen={!!selectedDevice}
            onClose={() => setSelectedDevice(null)}
            onDeploymentChange={handleDeploymentChange}
          />
        )}
      </div>
    </AuthGate>
  );
}
