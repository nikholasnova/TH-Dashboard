import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase env vars missing. Check web/.env.local');
}

export const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

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
  deployment_name: string;
  device_id: string;
  location: string;
  temp_avg: number | null;
  temp_min: number | null;
  temp_max: number | null;
  temp_stddev: number | null;
  humidity_avg: number | null;
  humidity_min: number | null;
  humidity_max: number | null;
  humidity_stddev: number | null;
  reading_count: number;
}

// Convert Celsius to Fahrenheit
export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32;
}

// Convert Celsius delta to Fahrenheit delta (no +32)
export function celsiusDeltaToFahrenheit(celsiusDelta: number): number {
  return (celsiusDelta * 9) / 5;
}

// Get latest reading for a device
export async function getLatestReading(deviceId: string): Promise<Reading | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('readings')
    .select('*')
    .eq('device_id', deviceId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116') {
    console.error('Error fetching latest reading:', error);
    return null;
  }

  return data;
}

// Get readings for a device within a time range
export async function getReadings(
  deviceId: string,
  hoursAgo: number,
  maxRows?: number
): Promise<Reading[]> {
  if (!supabase) return [];
  const since = new Date();
  since.setHours(since.getHours() - hoursAgo);

  let query = supabase
    .from('readings')
    .select('*')
    .eq('device_id', deviceId)
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (maxRows) query = query.limit(maxRows);

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching readings:', error);
    return [];
  }

  return data || [];
}

// Get readings for all devices within a time range
export async function getAllReadings(hoursAgo: number, maxRows?: number): Promise<Reading[]> {
  if (!supabase) return [];
  const since = new Date();
  since.setHours(since.getHours() - hoursAgo);

  let query = supabase
    .from('readings')
    .select('*')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (maxRows) query = query.limit(maxRows);

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching all readings:', error);
    return [];
  }

  return data || [];
}

// Get readings for all devices within a custom range
export async function getAllReadingsRange(params: {
  start: string;
  end: string;
  maxRows?: number;
}): Promise<Reading[]> {
  if (!supabase) return [];
  let query = supabase
    .from('readings')
    .select('*')
    .gte('created_at', params.start)
    .lte('created_at', params.end)
    .order('created_at', { ascending: true });

  if (params.maxRows) query = query.limit(params.maxRows);

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching readings by range:', error);
    return [];
  }

  return data || [];
}

// Get chart samples (time-bucketed averages)
export async function getChartSamples(params: {
  start: string;
  end: string;
  bucketSeconds: number;
  device_id?: string;
}): Promise<ChartSample[]> {
  if (!supabase) return [];

  const { data, error } = await supabase.rpc('get_chart_samples', {
    start_ts: params.start,
    end_ts: params.end,
    bucket_seconds: params.bucketSeconds,
  });

  if (error) {
    console.error('Error fetching chart samples:', error);
    return [];
  }

  // Client-side device filter
  if (params.device_id && data) {
    return data.filter((s: ChartSample) => s.device_id === params.device_id);
  }

  return data || [];
}

// Get device stats (server-side aggregates)
export async function getDeviceStats(params: {
  start: string;
  end: string;
  device_id?: string;
}): Promise<DeviceStats[]> {
  if (!supabase) return [];

  const { data, error } = await supabase.rpc('get_device_stats', {
    start_ts: params.start,
    end_ts: params.end,
  });

  if (error) {
    console.error('Error fetching device stats:', error);
    return [];
  }

  // Client-side device filter
  if (params.device_id && data) {
    return data.filter((s: DeviceStats) => s.device_id === params.device_id);
  }

  return data || [];
}

// Insert a test reading (for development)
export async function insertTestReading(
  deviceId: string,
  temperature: number,
  humidity: number
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('readings').insert({
    device_id: deviceId,
    temperature,
    humidity,
  });

  if (error) {
    console.error('Error inserting reading:', error);
    return false;
  }

  return true;
}

// ============================================================================
// Deployment CRUD Functions
// ============================================================================

// List deployments with optional filters
export async function getDeployments(filters?: {
  device_id?: string;
  location?: string;
  active_only?: boolean;
}): Promise<DeploymentWithCount[]> {
  if (!supabase) return [];

  let query = supabase.from('deployments').select('*');

  if (filters?.device_id) {
    query = query.eq('device_id', filters.device_id);
  }
  if (filters?.location) {
    query = query.eq('location', filters.location);
  }
  if (filters?.active_only) {
    query = query.is('ended_at', null);
  }

  query = query.order('started_at', { ascending: false });

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching deployments:', error);
    return [];
  }

  // Add reading_count for each deployment
  const deploymentsWithCount: DeploymentWithCount[] = [];
  for (const deployment of data || []) {
    let countQuery = supabase
      .from('readings')
      .select('id', { count: 'exact', head: true })
      .eq('device_id', deployment.device_id)
      .gte('created_at', deployment.started_at);

    if (deployment.ended_at) {
      countQuery = countQuery.lte('created_at', deployment.ended_at);
    }

    const { count } = await countQuery;
    deploymentsWithCount.push({
      ...deployment,
      reading_count: count || 0,
    });
  }

  return deploymentsWithCount;
}

// Get single deployment by ID
export async function getDeployment(id: number): Promise<Deployment | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('deployments')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('Error fetching deployment:', error);
    return null;
  }

  return data;
}

// Get current active deployment for a device (ended_at IS NULL)
export async function getActiveDeployment(deviceId: string): Promise<Deployment | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('deployments')
    .select('*')
    .eq('device_id', deviceId)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
    // Only log unexpected errors (not "no rows" or "table doesn't exist")
    console.error('Error fetching active deployment:', error.message || error.code);
    return null;
  }

  return data;
}

// Insert new deployment
export async function createDeployment(data: {
  device_id: string;
  name: string;
  location: string;
  notes?: string;
}): Promise<Deployment | null> {
  if (!supabase) return null;

  const { data: created, error } = await supabase
    .from('deployments')
    .insert({
      device_id: data.device_id,
      name: data.name,
      location: data.location,
      notes: data.notes || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating deployment:', error);
    return null;
  }

  return created;
}

// Partial update deployment
export async function updateDeployment(
  id: number,
  data: Partial<Pick<Deployment, 'name' | 'location' | 'notes' | 'started_at' | 'ended_at'>>
): Promise<Deployment | null> {
  if (!supabase) return null;

  const { data: updated, error } = await supabase
    .from('deployments')
    .update(data)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating deployment:', error);
    return null;
  }

  return updated;
}

// Set ended_at to NOW()
export async function endDeployment(id: number): Promise<Deployment | null> {
  if (!supabase) return null;

  const { data: updated, error } = await supabase
    .from('deployments')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error ending deployment:', error);
    return null;
  }

  return updated;
}

// Delete deployment by id
export async function deleteDeployment(id: number): Promise<boolean> {
  if (!supabase) return false;

  const { error } = await supabase.from('deployments').delete().eq('id', id);

  if (error) {
    console.error('Error deleting deployment:', error);
    return false;
  }

  return true;
}

// Get deployment stats via RPC function
export async function getDeploymentStats(deploymentIds: number[]): Promise<DeploymentStats[]> {
  if (!supabase) return [];
  if (deploymentIds.length === 0) return [];

  const { data, error } = await supabase.rpc('get_deployment_stats', {
    deployment_ids: deploymentIds,
  });

  if (error) {
    console.error('Error fetching deployment stats:', error);
    return [];
  }

  return data || [];
}

// Get readings for a deployment via RPC function
export async function getDeploymentReadings(
  deploymentId: number,
  limit?: number
): Promise<Reading[]> {
  if (!supabase) return [];

  const { data, error } = await supabase.rpc('get_deployment_readings', {
    p_deployment_id: deploymentId,
    p_limit: limit ?? 100,
  });

  if (error) {
    console.error('Error fetching deployment readings:', error);
    return [];
  }

  return data || [];
}

// Get unique locations from deployments for filter dropdowns
export async function getDistinctLocations(): Promise<string[]> {
  if (!supabase) return [];

  const { data, error } = await supabase.from('deployments').select('location');

  if (error) {
    console.error('Error fetching distinct locations:', error);
    return [];
  }

  // Extract unique locations
  const locations = new Set<string>();
  for (const row of data || []) {
    if (row.location) {
      locations.add(row.location);
    }
  }

  return Array.from(locations).sort();
}
