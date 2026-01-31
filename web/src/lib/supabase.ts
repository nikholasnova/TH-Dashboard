import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars missing. Check web/.env.local');
}

// Single shared Supabase client for browser-side operations
// Uses @supabase/ssr for cookie-based session storage (shared with server)
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createBrowserClient(supabaseUrl, supabaseAnonKey)
    : null;

export interface Reading {
  id: number;
  device_id: string;
  temperature: number; // Celsius
  humidity: number;
  created_at: string;
}

export interface ChartSample {
  bucket_ts: string;
  device_id: string;
  temperature_avg: number;
  humidity_avg: number;
  reading_count: number;
}

export interface DeviceStats {
  device_id: string;
  temp_avg: number | null;
  temp_min: number | null;
  temp_max: number | null;
  temp_stddev: number | null;
  humidity_avg: number | null;
  humidity_min: number | null;
  humidity_max: number | null;
  humidity_stddev: number | null;
  reading_count: number | null;
}

export interface Deployment {
  id: number;
  device_id: string;
  name: string;
  location: string;
  notes: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface DeploymentWithCount extends Deployment {
  reading_count: number;
}

export interface DeploymentStats {
  deployment_id: number;
  deployment_name?: string;
  location?: string;
  device_id?: string;
  temp_avg: number | null;
  temp_min: number | null;
  temp_max: number | null;
  temp_stddev: number | null;
  humidity_avg: number | null;
  humidity_min: number | null;
  humidity_max: number | null;
  humidity_stddev: number | null;
  reading_count: number | null;
}

// Temperature conversion utilities
export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

export function celsiusDeltaToFahrenheit(celsiusDelta: number): number {
  return (celsiusDelta * 9) / 5;
}

// Get latest reading for a device
export async function getLatestReading(
  deviceId: string
): Promise<Reading | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('readings')
    .select('*')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code !== 'PGRST116') {
      console.error(`Error fetching latest reading for ${deviceId}:`, error);
    }
    return null;
  }
  return data;
}

// Get readings for a device within the last N hours
export async function getReadings(
  deviceId: string,
  hoursAgo: number,
  maxRows?: number
): Promise<Reading[]> {
  if (!supabase) return [];

  const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from('readings')
    .select('*')
    .eq('device_id', deviceId)
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (maxRows) {
    query = query.limit(maxRows);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`Error fetching readings for ${deviceId}:`, error);
    return [];
  }
  return data || [];
}

// Get all readings for all devices within the last N hours
export async function getAllReadings(
  hoursAgo: number,
  maxRows?: number
): Promise<Reading[]> {
  if (!supabase) return [];

  const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  let query = supabase
    .from('readings')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: true });

  if (maxRows) {
    query = query.limit(maxRows);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching all readings:', error);
    return [];
  }
  return data || [];
}

// Get all readings for all devices within a custom date range
export async function getAllReadingsRange(params: {
  start: string;
  end: string;
  device_id?: string;
  maxRows?: number;
}): Promise<Reading[]> {
  if (!supabase) return [];

  let query = supabase
    .from('readings')
    .select('*')
    .gte('created_at', params.start)
    .lte('created_at', params.end)
    .order('created_at', { ascending: true });

  if (params.device_id) {
    query = query.eq('device_id', params.device_id);
  }

  if (params.maxRows) {
    query = query.limit(params.maxRows);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching readings range:', error);
    return [];
  }
  return data || [];
}

// Get chart samples using server-side bucketing
export async function getChartSamples(params: {
  start: string;
  end: string;
  bucketSeconds: number;
  device_id?: string;
}): Promise<ChartSample[]> {
  if (!supabase) return [];

  // Convert seconds to minutes for the RPC
  const bucketMinutes = Math.max(1, Math.round(params.bucketSeconds / 60));

  const { data, error } = await supabase.rpc('get_chart_samples', {
    p_start: params.start,
    p_end: params.end,
    p_bucket_minutes: bucketMinutes,
    p_device_id: params.device_id || null,
  });

  if (error) {
    console.error('Error fetching chart samples:', error.message || error.code || JSON.stringify(error));
    return [];
  }
  return data || [];
}

// Get device statistics using server-side aggregation
export async function getDeviceStats(params: {
  start: string;
  end: string;
  device_id?: string;
}): Promise<DeviceStats[]> {
  if (!supabase) return [];

  const { data, error } = await supabase.rpc('get_device_stats', {
    p_start: params.start,
    p_end: params.end,
    p_device_id: params.device_id || null,
  });

  if (error) {
    console.error('Error fetching device stats:', error.message || error.code || JSON.stringify(error));
    return [];
  }
  return data || [];
}

// Get all deployments with optional filters
export async function getDeployments(filters?: {
  deviceId?: string;
  location?: string;
  status?: 'all' | 'active' | 'ended';
}): Promise<DeploymentWithCount[]> {
  if (!supabase) return [];

  let query = supabase.from('deployments').select('*');

  if (filters?.deviceId) {
    query = query.eq('device_id', filters.deviceId);
  }

  if (filters?.location) {
    query = query.eq('location', filters.location);
  }

  if (filters?.status === 'active') {
    query = query.is('ended_at', null);
  } else if (filters?.status === 'ended') {
    query = query.not('ended_at', 'is', null);
  }

  query = query.order('started_at', { ascending: false });

  const { data: deployments, error } = await query;

  if (error) {
    console.error('Error fetching deployments:', error);
    return [];
  }

  if (!deployments || deployments.length === 0) return [];

  // Get reading counts for each deployment
  const deploymentsWithCounts: DeploymentWithCount[] = await Promise.all(
    deployments.map(async (d) => {
      const { count } = await supabase
        .from('readings')
        .select('*', { count: 'exact', head: true })
        .eq('device_id', d.device_id)
        .gte('created_at', d.started_at)
        .lte('created_at', d.ended_at || new Date().toISOString());

      return { ...d, reading_count: count || 0 };
    })
  );

  return deploymentsWithCounts;
}

// Get a single deployment by ID
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

// Create a new deployment
export async function createDeployment(deployment: {
  device_id: string;
  name: string;
  location: string;
  notes?: string;
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

// Update an existing deployment
export async function updateDeployment(
  id: number,
  updates: {
    name?: string;
    location?: string;
    notes?: string | null;
  }
): Promise<Deployment | null> {
  if (!supabase) return null;

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

// End a deployment (set ended_at to now)
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

// Delete a deployment
export async function deleteDeployment(id: number): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase.from('deployments').delete().eq('id', id);

  if (error) {
    console.error('Error deleting deployment:', error);
    return false;
  }

  return true;
}

// Get the active deployment for a device (ended_at is null)
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

// Get deployment stats using server-side aggregation
export async function getDeploymentStats(
  deploymentIds: number[]
): Promise<DeploymentStats[]> {
  if (!supabase || deploymentIds.length === 0) return [];

  const { data, error } = await supabase.rpc('get_deployment_stats', {
    p_deployment_ids: deploymentIds,
  });

  if (error) {
    console.error('Error fetching deployment stats:', error);
    return [];
  }

  return data || [];
}

// Get readings for a specific deployment
export async function getDeploymentReadings(
  deploymentId: number,
  limit?: number
): Promise<Reading[]> {
  if (!supabase) return [];

  // First get the deployment to know time range and device
  const deployment = await getDeployment(deploymentId);
  if (!deployment) return [];

  let query = supabase
    .from('readings')
    .select('*')
    .eq('device_id', deployment.device_id)
    .gte('created_at', deployment.started_at)
    .order('created_at', { ascending: true });

  if (deployment.ended_at) {
    query = query.lte('created_at', deployment.ended_at);
  }

  if (limit) {
    query = query.limit(limit);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching deployment readings:', error);
    return [];
  }

  return data || [];
}

// Get distinct locations from deployments
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

  // Get unique locations
  const locations = [...new Set(data?.map((d) => d.location) || [])];
  return locations;
}
