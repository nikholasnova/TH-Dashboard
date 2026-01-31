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

  return data || [];
}

// Get device stats (server-side aggregates)
export async function getDeviceStats(params: {
  start: string;
  end: string;
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
