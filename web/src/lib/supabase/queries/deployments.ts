import { supabase } from '../client';
import type {
  Reading,
  Deployment,
  DeploymentWithCount,
  DeploymentStats,
} from '../types';
import { normalizeUsZipCode } from '../../weatherZip';

export async function getDeployments(filters?: {
  deviceId?: string;
  location?: string;
  status?: 'all' | 'active' | 'ended';
}): Promise<DeploymentWithCount[]> {
  if (!supabase) {
    console.warn('Supabase client not initialized');
    return [];
  }

  const { data, error } = await supabase.rpc('get_deployments_with_counts', {
    p_device_id: filters?.deviceId || null,
    p_active_only: filters?.status === 'active',
  });

  if (error) {
    console.error('Error fetching deployments:', error);
    return [];
  }

  let results = (data || []) as DeploymentWithCount[];

  if (filters?.location) {
    results = results.filter(d => d.location === filters.location);
  }
  if (filters?.status === 'ended') {
    results = results.filter(d => d.ended_at !== null);
  }

  return results;
}

export async function getDeployment(id: number): Promise<Deployment | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('deployments')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching deployment:', error);
    return null;
  }

  return data;
}

export async function createDeployment(deployment: {
  device_id: string;
  name: string;
  location: string;
  notes?: string;
  zip_code?: string;
  started_at?: string;
}): Promise<Deployment | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('deployments')
    .insert({
      device_id: deployment.device_id,
      name: deployment.name,
      location: deployment.location,
      notes: deployment.notes || null,
      zip_code: deployment.zip_code ? normalizeUsZipCode(deployment.zip_code) : null,
      started_at: deployment.started_at || new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating deployment:', error);
    return null;
  }

  return data;
}

export async function updateDeployment(
  id: number,
  updates: {
    name?: string;
    location?: string;
    notes?: string | null;
    zip_code?: string | null;
    started_at?: string;
    ended_at?: string | null;
  }
): Promise<Deployment | null> {
  if (!supabase) return null;

  if ('zip_code' in updates && updates.zip_code != null) {
    updates.zip_code = normalizeUsZipCode(updates.zip_code);
  }

  const { data, error } = await supabase
    .from('deployments')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating deployment:', error);
    return null;
  }

  return data;
}

export async function endDeployment(id: number): Promise<Deployment | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('deployments')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error ending deployment:', error);
    return null;
  }

  return data;
}

export async function deleteDeployment(id: number): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase.rpc('delete_deployment_cascade', {
    p_deployment_id: id,
  });

  if (error) {
    console.error('Error deleting deployment:', error);
    return false;
  }

  return true;
}

export async function getActiveDeployment(
  deviceId: string
): Promise<Deployment | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('deployments')
    .select('*')
    .eq('device_id', deviceId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching active deployment:', error);
    return null;
  }

  return data;
}

export async function getDeploymentStats(
  deploymentIds: number[]
): Promise<DeploymentStats[]> {
  if (!supabase || deploymentIds.length === 0) return [];

  const { data, error } = await supabase.rpc('get_deployment_stats', {
    deployment_ids: deploymentIds,
  });

  if (error) {
    console.error('Error fetching deployment stats:', error);
    return [];
  }

  return data || [];
}

export async function getDeploymentReadings(
  deploymentId: number,
  limit?: number,
  options?: {
    start?: string;
    end?: string;
    preferLatest?: boolean;
  }
): Promise<Reading[]> {
  if (!supabase) return [];

  const deployment = await getDeployment(deploymentId);
  if (!deployment) return [];

  const deploymentStartMs = new Date(deployment.started_at).getTime();
  const deploymentEndMs = new Date(
    deployment.ended_at || new Date().toISOString()
  ).getTime();
  const requestedStartMs = options?.start
    ? new Date(options.start).getTime()
    : deploymentStartMs;
  const requestedEndMs = options?.end
    ? new Date(options.end).getTime()
    : deploymentEndMs;

  if (!Number.isFinite(requestedStartMs) || !Number.isFinite(requestedEndMs)) {
    console.error('Invalid date range passed to getDeploymentReadings');
    return [];
  }

  const clampedStartMs = Math.max(deploymentStartMs, requestedStartMs);
  const clampedEndMs = Math.min(deploymentEndMs, requestedEndMs);

  if (clampedStartMs > clampedEndMs) {
    return [];
  }

  const shouldFetchLatestWindow = Boolean(limit) && (options?.preferLatest ?? false);
  const startIso = new Date(clampedStartMs).toISOString();
  const endIso = new Date(clampedEndMs).toISOString();

  if (limit) {
    const { data, error } = await supabase
      .from('readings')
      .select('*')
      .eq('device_id', deployment.device_id)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: !shouldFetchLatestWindow })
      .order('id', { ascending: !shouldFetchLatestWindow })
      .limit(limit);

    if (error) {
      console.error('Error fetching deployment readings:', error);
      return [];
    }

    const rows = data || [];
    if (!shouldFetchLatestWindow) return rows;

    return [...rows].sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }

  const pageSize = 1000;
  const rows: Reading[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('readings')
      .select('*')
      .eq('device_id', deployment.device_id)
      .gte('created_at', startIso)
      .lte('created_at', endIso)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (error) {
      console.error('Error fetching deployment readings:', error);
      return [];
    }

    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) {
      break;
    }
  }

  return rows;
}

export async function getDistinctLocations(): Promise<string[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('deployments')
    .select('location')
    .order('location');

  if (error) {
    console.error('Error fetching locations:', error);
    return [];
  }

  const locations = [...new Set(data?.map((d) => d.location) || [])];
  return locations;
}
