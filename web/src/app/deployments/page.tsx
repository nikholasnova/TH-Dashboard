'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { DeploymentModal } from '@/components/DeploymentModal';
import {
  DeploymentWithCount,
  getDeployments,
  getDistinctLocations,
} from '@/lib/supabase';

type StatusFilter = 'all' | 'active' | 'ended';

export default function DeploymentsPage() {
  const [deployments, setDeployments] = useState<DeploymentWithCount[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [deviceFilter, setDeviceFilter] = useState<string>('');
  const [locationFilter, setLocationFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Modal
  const [selectedDeployment, setSelectedDeployment] = useState<DeploymentWithCount | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);

  const fetchData = useCallback(async () => {
    setIsLoading(true);

    const filters: { device_id?: string; location?: string; active_only?: boolean } = {};
    if (deviceFilter) filters.device_id = deviceFilter;
    if (locationFilter) filters.location = locationFilter;
    if (statusFilter === 'active') filters.active_only = true;

    const [deps, locs] = await Promise.all([
      getDeployments(filters),
      getDistinctLocations(),
    ]);

    // Apply ended filter client-side (API doesn't have ended_only)
    const filtered = statusFilter === 'ended'
      ? deps.filter(d => d.ended_at !== null)
      : deps;

    setDeployments(filtered);
    setLocations(locs);
    setIsLoading(false);
  }, [deviceFilter, locationFilter, statusFilter]);

  useEffect(() => {
    fetchData();
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
    <div className="min-h-screen">
      <div className="container-responsive">
        {/* Header */}
        <header className="mb-10">
          <h1 className="text-4xl font-bold text-white mb-2">Deployments</h1>
          <p className="text-lg text-[#a0aec0]">Manage device placement sessions</p>
        </header>

        {/* Navigation */}
        <nav className="glass-card p-2 mb-10 inline-flex gap-2">
          <Link href="/" className="px-6 py-3 text-[#a0aec0] hover:text-white rounded-xl text-sm font-medium transition-colors">
            Live
          </Link>
          <Link href="/charts" className="px-6 py-3 text-[#a0aec0] hover:text-white rounded-xl text-sm font-medium transition-colors">
            Charts
          </Link>
          <Link href="/compare" className="px-6 py-3 text-[#a0aec0] hover:text-white rounded-xl text-sm font-medium transition-colors">
            Compare
          </Link>
          <Link href="/deployments" className="nav-active px-6 py-3 text-white text-sm font-semibold">
            Deployments
          </Link>
        </nav>

        {/* Filters & Actions */}
        <div className="flex flex-wrap items-center gap-4 mb-8">
          <div className="glass-card p-3 flex flex-wrap items-center gap-4">
            <span className="text-xs text-[#a0aec0] font-medium">Filters:</span>

            <select
              value={deviceFilter}
              onChange={(e) => setDeviceFilter(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white min-w-[100px]"
            >
              <option value="">All Devices</option>
              <option value="node1">Node 1</option>
              <option value="node2">Node 2</option>
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

        {/* Deployments List */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card p-6">
                <div className="flex items-center gap-4">
                  <div className="skeleton w-3 h-3 rounded-full"></div>
                  <div className="flex-1">
                    <div className="skeleton h-6 w-48 mb-2"></div>
                    <div className="skeleton h-4 w-32"></div>
                  </div>
                  <div className="skeleton h-4 w-24"></div>
                </div>
              </div>
            ))}
          </div>
        ) : deployments.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <p className="text-xl text-[#a0aec0] mb-2">No deployments found</p>
            <p className="text-sm text-[#a0aec0]/60">
              {deviceFilter || locationFilter || statusFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first deployment by clicking a device on the dashboard'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {deployments.map((dep) => (
              <div
                key={dep.id}
                onClick={() => setSelectedDeployment(dep)}
                className="glass-card p-6 cursor-pointer hover:border-white/30 transition-all"
              >
                <div className="flex items-center gap-4">
                  {/* Status Indicator */}
                  <div className={`w-3 h-3 rounded-full ${dep.ended_at ? 'bg-[#a0aec0]/40' : 'bg-[#01b574] animate-pulse'}`} />

                  {/* Main Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate">{dep.name}</h3>
                    <p className="text-sm text-[#a0aec0]">
                      {dep.device_id} &bull; {dep.location}
                    </p>
                  </div>

                  {/* Date Range */}
                  <div className="text-right hidden sm:block">
                    <p className="text-sm text-white">{formatDateRange(dep)}</p>
                    <p className="text-xs text-[#a0aec0]">
                      {dep.ended_at ? 'Ended' : 'Active'}
                    </p>
                  </div>

                  {/* Reading Count */}
                  <div className="text-right">
                    <p className="text-sm font-medium text-white">{dep.reading_count.toLocaleString()}</p>
                    <p className="text-xs text-[#a0aec0]">readings</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal for existing deployment */}
      {selectedDeployment && (
        <DeploymentModal
          deviceId={selectedDeployment.device_id}
          deviceName={selectedDeployment.device_id === 'node1' ? 'Node 1' : 'Node 2'}
          isOpen={!!selectedDeployment}
          onClose={() => setSelectedDeployment(null)}
          onDeploymentChange={fetchData}
        />
      )}

      {/* New Deployment Modal (defaults to node1) */}
      {showNewModal && (
        <DeploymentModal
          deviceId="node1"
          deviceName="Node 1"
          isOpen={showNewModal}
          onClose={() => setShowNewModal(false)}
          onDeploymentChange={fetchData}
        />
      )}
    </div>
  );
}
