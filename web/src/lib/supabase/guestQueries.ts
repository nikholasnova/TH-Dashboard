import type {
  Reading,
  ChartSample,
  DeviceStats,
  Device,
  DeviceAlertState,
  Deployment,
  DeploymentWithCount,
  DeploymentStats,
} from './types';
import type { DashboardLiveData } from './queries/readings';
import { parseDashboardLiveRows } from './queries/readings';

type GuestAction =
  | 'dashboard_live'
  | 'device_stats'
  | 'devices'
  | 'deployments'
  | 'active_deployments'
  | 'chart_samples'
  | 'deployment_stats'
  | 'deployment_readings'
  | 'readings'
  | 'all_readings'
  | 'all_readings_range'
  | 'alert_states'
  | 'distinct_locations'
  | 'deployment';

async function guestFetch(action: GuestAction, params: Record<string, unknown> = {}) {
  const res = await fetch('/api/guest-data', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, params }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Guest data fetch failed');
  }
  const { data } = await res.json();
  return data;
}

export async function guestGetDevices(activeOnly = true): Promise<Device[]> {
  return guestFetch('devices', { activeOnly });
}

export async function guestGetDeviceAlertStates(
  deviceIds: string[]
): Promise<DeviceAlertState[]> {
  return guestFetch('alert_states', { deviceIds });
}

export async function guestGetDashboardLive(
  deviceIds: string[],
  sparklineStart: string,
  sparklineBucketMinutes = 15
): Promise<DashboardLiveData> {
  if (deviceIds.length === 0) {
    return { sensor: {}, weather: {}, sparklines: {} };
  }

  const raw = await guestFetch('dashboard_live', {
    deviceIds,
    sparklineStart,
    sparklineBucketMinutes,
  });

  return parseDashboardLiveRows(deviceIds, raw || []);
}

export async function guestGetDeviceStats(params: {
  start: string;
  end: string;
  device_id?: string;
}): Promise<DeviceStats[]> {
  return guestFetch('device_stats', params);
}

export async function guestGetReadings(
  deviceId: string,
  hoursAgo: number,
  maxRows?: number
): Promise<Reading[]> {
  return guestFetch('readings', { deviceId, hoursAgo, maxRows });
}

export async function guestGetAllReadings(
  hoursAgo: number,
  maxRows?: number
): Promise<Reading[]> {
  return guestFetch('all_readings', { hoursAgo, maxRows });
}

export async function guestGetAllReadingsRange(params: {
  start: string;
  end: string;
  device_id?: string;
  maxRows?: number;
}): Promise<Reading[]> {
  return guestFetch('all_readings_range', params);
}

export async function guestGetChartSamples(params: {
  start: string;
  end: string;
  bucketSeconds: number;
  device_id?: string;
  maxRows?: number;
}): Promise<ChartSample[]> {
  return guestFetch('chart_samples', params);
}

export async function guestGetDeployments(filters?: {
  deviceId?: string;
  location?: string;
  status?: 'all' | 'active' | 'ended';
}): Promise<DeploymentWithCount[]> {
  const raw: DeploymentWithCount[] = await guestFetch('deployments', {
    deviceId: filters?.deviceId || null,
    activeOnly: filters?.status === 'active',
  });

  let results = raw;
  if (filters?.location) {
    results = results.filter((d) => d.location === filters.location);
  }
  if (filters?.status === 'ended') {
    results = results.filter((d) => d.ended_at !== null);
  }
  return results;
}

export async function guestGetDeployment(id: number): Promise<Deployment | null> {
  return guestFetch('deployment', { id });
}

export async function guestGetActiveDeployments(
  deviceIds: string[]
): Promise<Record<string, Deployment | null>> {
  const result: Record<string, Deployment | null> = {};
  for (const id of deviceIds) result[id] = null;
  if (deviceIds.length === 0) return result;

  const raw: Deployment[] = await guestFetch('active_deployments', { deviceIds });
  for (const row of raw || []) {
    if (result[row.device_id] === null) {
      result[row.device_id] = row;
    }
  }
  return result;
}

export async function guestGetDeploymentStats(
  deploymentIds: number[]
): Promise<DeploymentStats[]> {
  if (deploymentIds.length === 0) return [];
  return guestFetch('deployment_stats', { deploymentIds });
}

export async function guestGetDeploymentReadings(
  deploymentId: number,
  limit?: number,
  options?: { start?: string; end?: string; preferLatest?: boolean }
): Promise<Reading[]> {
  return guestFetch('deployment_readings', { deploymentId, limit, options });
}

export async function guestGetDistinctLocations(): Promise<string[]> {
  return guestFetch('distinct_locations');
}
