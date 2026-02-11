import { supabase } from '../client';
import type { Reading, ChartSample, DeviceStats } from '../types';

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
    .maybeSingle();

  if (error) {
    console.error(`Error fetching latest reading for ${deviceId}:`, error);
    return null;
  }
  return data;
}

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

export async function getChartSamples(params: {
  start: string;
  end: string;
  bucketSeconds: number;
  device_id?: string;
  maxRows?: number;
}): Promise<ChartSample[]> {
  if (!supabase) return [];

  const bucketMinutes = Math.max(1, Math.round(params.bucketSeconds / 60));

  let query = supabase.rpc('get_chart_samples', {
    p_start: params.start,
    p_end: params.end,
    p_bucket_minutes: bucketMinutes,
    p_device_id: params.device_id || null,
  });

  if (params.maxRows) {
    query = query.limit(params.maxRows);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching chart samples:', error.message || error.code || JSON.stringify(error));
    return [];
  }
  return data || [];
}

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
