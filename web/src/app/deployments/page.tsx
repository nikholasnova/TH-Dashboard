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
import { DataCleanupModal } from '@/components/DataCleanupModal';

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
  const [showCleanupModal, setShowCleanupModal] = useState(false);

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
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4 mb-6 sm:mb-8">
          <div className="glass-card p-3 flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3 sm:gap-4">
            <span className="text-xs text-[var(--foreground-muted)] font-medium">Filters:</span>

            <select
              value={deviceFilter}
              onChange={(e) => setDeviceFilter(e.target.value)}
              className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] w-full sm:w-auto sm:min-w-[100px]"
            >
              <option value="">All Devices</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.display_name}</option>
              ))}
            </select>

            <select
              value={locationFilter}
              onChange={(e) => setLocationFilter(e.target.value)}
              className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] w-full sm:w-auto sm:min-w-[120px]"
            >
              <option value="">All Locations</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)] w-full sm:w-auto sm:min-w-[100px]"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="ended">Ended</option>
            </select>
          </div>

          <div className="flex gap-3 w-full sm:w-auto">
            <button
              onClick={() => setShowCleanupModal(true)}
              className="btn-glass px-5 py-3 text-sm text-[var(--foreground-muted)] hover:text-[var(--error)] transition-colors w-full sm:w-auto"
            >
              Clean Up Data
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              className="btn-glass px-5 py-3 text-sm font-semibold text-[var(--foreground)] w-full sm:w-auto"
            >
              + New Deployment
            </button>
          </div>
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
                className="glass-card p-4 sm:p-6 cursor-pointer hover:border-[var(--btn-border-hover)] transition-all"
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className={`w-3 h-3 rounded-full shrink-0 ${dep.ended_at ? 'bg-[var(--foreground-muted)]/40' : 'bg-[var(--success)] animate-pulse'}`} />

                  <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold text-[var(--foreground)] truncate">{dep.name}</h3>
                    <p className="text-xs sm:text-sm text-[var(--foreground-muted)]">
                      {dep.device_id} &bull; {dep.location}
                    </p>
                    <p className="text-xs text-[var(--foreground-muted)] mt-0.5 sm:hidden">
                      {formatDateRange(dep)} &bull; {dep.reading_count.toLocaleString()} readings
                    </p>
                  </div>

                  <div className="text-right hidden sm:block">
                    <p className="text-sm text-[var(--foreground)]">{formatDateRange(dep)}</p>
                    <p className="text-xs text-[var(--foreground-muted)]">
                      {dep.ended_at ? 'Ended' : 'Active'}
                    </p>
                  </div>

                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-medium text-[var(--foreground)]">{dep.reading_count.toLocaleString()}</p>
                    <p className="text-xs text-[var(--foreground-muted)]">readings</p>
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
          createOnly
          isOpen={showNewModal}
          onClose={() => setShowNewModal(false)}
          onDeploymentChange={fetchData}
        />
      )}
      <DataCleanupModal
        isOpen={showCleanupModal}
        onClose={() => setShowCleanupModal(false)}
        onComplete={fetchData}
      />
    </PageLayout>
  );
}
