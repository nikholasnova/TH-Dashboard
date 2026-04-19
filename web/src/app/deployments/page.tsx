'use client';

import { useEffect, useState, useCallback } from 'react';
import { DeploymentModal } from '@/components/DeploymentModal';
import { PageLayout } from '@/components/PageLayout';
import {
  DeploymentWithCount,
  getDeployments,
  getDistinctLocations,
} from '@/lib/supabase';
import { guestGetDeployments, guestGetDistinctLocations } from '@/lib/supabase/guestQueries';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { EmptyState } from '@/components/EmptyState';
import { useDevices } from '@/contexts/DevicesContext';
import { DataCleanupModal } from '@/components/DataCleanupModal';
import { useGuest } from '@/contexts/GuestContext';
import { SegmentedNav } from '@/components/SegmentedNav';
import { InlineSelect } from '@/components/DeviceDeploymentFilter';

type StatusFilter = 'all' | 'active' | 'ended';

export default function DeploymentsPage() {
  const { devices } = useDevices();
  const { isGuest } = useGuest();
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

    const fetchDeps = isGuest ? guestGetDeployments : getDeployments;
    const fetchLocs = isGuest ? guestGetDistinctLocations : getDistinctLocations;
    const [deps, locs] = await Promise.all([
      fetchDeps(filters),
      fetchLocs(),
    ]);

    const filtered = deps;

    setDeployments(filtered);
    setLocations(locs);
    setIsLoading(false);
  }, [deviceFilter, locationFilter, statusFilter, isGuest]);

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
    <PageLayout title="Deployments">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-4 sm:gap-6">
            <InlineSelect
              value={deviceFilter}
              onChange={setDeviceFilter}
              placeholder="All devices"
              className="w-full sm:w-40"
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.display_name}</option>
              ))}
            </InlineSelect>

            <InlineSelect
              value={locationFilter}
              onChange={setLocationFilter}
              placeholder="All locations"
              className="w-full sm:w-40"
            >
              {locations.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </InlineSelect>

            <SegmentedNav
              layoutGroupId="deployments-status"
              value={statusFilter}
              onChange={(v) => setStatusFilter(v as StatusFilter)}
              options={[
                { value: 'all', label: 'All' },
                { value: 'active', label: 'Active' },
                { value: 'ended', label: 'Ended' },
              ]}
            />
          </div>

          {!isGuest && (
            <div className="flex gap-6 w-full sm:w-auto">
              <button
                onClick={() => setShowCleanupModal(true)}
                className="h-14 inline-flex items-center text-sm tracking-tight text-[var(--fg-muted)] hover:text-[var(--error)] transition-colors"
              >
                Clean Up Data
              </button>
              <button
                onClick={() => setShowNewModal(true)}
                className="h-14 inline-flex items-center gap-2 text-sm tracking-tight text-[var(--fg-muted)] hover:text-[var(--fg)] transition-colors"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New Deployment
              </button>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="py-16">
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
          <div className="divide-y divide-[var(--hairline)] border-y border-[var(--hairline)]">
            {deployments.map((dep) => (
              <div
                key={dep.id}
                onClick={isGuest ? undefined : () => setSelectedDeployment(dep)}
                className={`px-4 sm:px-6 py-4 transition-colors ${isGuest ? '' : 'cursor-pointer hover:bg-[var(--hover-bg)]'}`}
              >
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${dep.ended_at ? 'bg-[var(--foreground-muted)]/40' : 'bg-[var(--success)]'}`} />

                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-[var(--foreground)] truncate">{dep.name}</h3>
                    <p className="text-xs text-[var(--foreground-muted)] mt-0.5">
                      {dep.device_id} &middot; {dep.location}
                    </p>
                    <p className="text-xs text-[var(--foreground-muted)] mt-0.5 sm:hidden" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {formatDateRange(dep)} &middot; {dep.reading_count.toLocaleString()} readings
                    </p>
                  </div>

                  <div className="text-right hidden sm:block shrink-0 w-36">
                    <p className="text-sm text-[var(--foreground)]">{formatDateRange(dep)}</p>
                    <p className="eyebrow mt-0.5">
                      {dep.ended_at ? 'Ended' : 'Active'}
                    </p>
                  </div>

                  <div className="text-right hidden sm:block shrink-0 w-24">
                    <p className="text-sm font-medium text-[var(--foreground)]" style={{ fontVariantNumeric: 'tabular-nums' }}>{dep.reading_count.toLocaleString()}</p>
                    <p className="eyebrow mt-0.5">readings</p>
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
