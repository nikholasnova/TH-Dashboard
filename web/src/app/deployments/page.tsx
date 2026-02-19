'use client';

import { useEffect, useState, useCallback } from 'react';
import { DeploymentModal } from '@/components/DeploymentModal';
import { PageLayout } from '@/components/PageLayout';
import {
  DeploymentWithCount,
  getDeployments,
  getDistinctLocations,
} from '@/lib/supabase';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { EmptyState } from '@/components/EmptyState';
import { useDevices } from '@/contexts/DevicesContext';

type StatusFilter = 'all' | 'active' | 'ended';

export default function DeploymentsPage() {
  const { devices } = useDevices();
  const [deployments, setDeployments] = useState<DeploymentWithCount[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [deviceFilter, setDeviceFilter] = useState<string>('');
  const [locationFilter, setLocationFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const [selectedDeployment, setSelectedDeployment] = useState<DeploymentWithCount | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);

    const filters: { deviceId?: string; location?: string; status?: 'all' | 'active' | 'ended' } = {};
    if (deviceFilter) filters.deviceId = deviceFilter;
    if (locationFilter) filters.location = locationFilter;
    if (statusFilter !== 'all') filters.status = statusFilter;

    const [deps, locs] = await Promise.all([
      getDeployments(filters),
      getDistinctLocations(),
    ]);

    const filtered = deps;

    setDeployments(filtered);
    setLocations(locs);
    setIsLoading(false);
  }, [deviceFilter, locationFilter, statusFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchData();
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchData]);

  const formatDateRange = (dep: DeploymentWithCount) => {
    const start = new Date(dep.started_at);
    const startStr = start.toLocaleDateString([], { month: 'short', day: 'numeric' });

    if (dep.ended_at) {
      const end = new Date(dep.ended_at);
      const endStr = end.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return `${startStr} - ${endStr}`;
    }
    return `Started ${startStr}`;
  };

  return (
    <PageLayout title="Deployments" subtitle="Manage device placement sessions">
        <div className="flex flex-wrap items-center gap-4 mb-8">
          <div className="glass-card p-3 flex flex-wrap items-center gap-4">
            <span className="text-xs text-[#a0aec0] font-medium">Filters:</span>

            <select
              value={deviceFilter}
              onChange={(e) => setDeviceFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[100px]"
            >
              <option value="">All Devices</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.display_name}</option>
              ))}
            </select>

            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[120px]"
            >
              <option value="">All Locations</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[100px]"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="ended">Ended</option>
            </select>
          </div>

          <button
            onClick={() => setShowNewModal(true)}
            className="btn-glass px-5 py-3 text-sm font-semibold text-white"
          >
            + New Deployment
          </button>
        </div>

        {isLoading ? (
          <div className="glass-card p-12">
            <LoadingSpinner message="Loading deployments..." />
          </div>
        ) : deployments.length === 0 ? (
          <EmptyState
            title="No deployments found"
            subtitle={
              deviceFilter || locationFilter || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first deployment by clicking a device on the dashboard'
            }
          />
        ) : (
          <div className="space-y-4">
            {deployments.map((dep) => (
              <div
                key={dep.id}
                onClick={() => setSelectedDeployment(dep)}
                className="glass-card p-6 cursor-pointer hover:border-white/30 transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-3 h-3 rounded-full ${dep.ended_at ? 'bg-[#a0aec0]/40' : 'bg-[#01b574] animate-pulse'}`} />

                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate">{dep.name}</h3>
                    <p className="text-sm text-[#a0aec0]">
                      {dep.device_id} &bull; {dep.location}
                    </p>
                  </div>

                  <div className="text-right hidden sm:block">
                    <p className="text-sm text-white">{formatDateRange(dep)}</p>
                    <p className="text-xs text-[#a0aec0]">
                      {dep.ended_at ? 'Ended' : 'Active'}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-medium text-white">{dep.reading_count.toLocaleString()}</p>
                    <p className="text-xs text-[#a0aec0]">readings</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      {selectedDeployment && (
        <DeploymentModal
          deviceId={selectedDeployment.device_id}
          deviceName={devices.find((d) => d.id === selectedDeployment.device_id)?.display_name || selectedDeployment.device_id}
          existingDeployment={selectedDeployment}
          isOpen={!!selectedDeployment}
          onClose={() => setSelectedDeployment(null)}
          onDeploymentChange={fetchData}
        />
      )}

      {showNewModal && (
        <DeploymentModal
          deviceId={devices[0]?.id || ''}
          deviceName={devices[0]?.display_name || 'Device'}
          isOpen={showNewModal}
          onClose={() => setShowNewModal(false)}
          onDeploymentChange={fetchData}
        />
      )}
    </PageLayout>
  );
}
