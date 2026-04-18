import { supabase } from '../client';
import type { Reading, ChartSample, DeviceStats } from '../types';

export interface DashboardLiveData {
  sensor: Record<string, Reading | null>;
  weather: Record<string, Reading | null>;
  sparklines: Record<string, ChartSample[]>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseDashboardLiveRows(deviceIds: string[], rows: any[]): DashboardLiveData {
  const result: DashboardLiveData = { sensor: {}, weather: {}, sparklines: {} };
  for (const id of deviceIds) {
    result.sensor[id] = null;
    result.weather[id] = null;
    result.sparklines[id] = [];
  }

  for (const row of rows) {
    if (row.row_type === 'sensor') {
      result.sensor[row.device_id] = {
        id: row.id,
        device_id: row.device_id,
        temperature: row.temperature,
        humidity: row.humidity,
        created_at: row.created_at,
        source: row.source as 'sensor',
      };
    } else if (row.row_type === 'weather') {
      const sensorId = row.device_id.replace(/^weather_/, '');
      result.weather[sensorId] = {
        id: row.id,
        device_id: row.device_id,
        temperature: row.temperature,
        humidity: row.humidity,
        created_at: row.created_at,
        source: row.source as 'weather',
      };
    } else if (row.row_type === 'sparkline') {
      if (!result.sparklines[row.device_id]) result.sparklines[row.device_id] = [];
      result.sparklines[row.device_id].push({
        bucket_ts: row.bucket_ts,
        device_id: row.device_id,
        temperature_avg: row.temperature_avg,
        humidity_avg: row.humidity_avg,
        reading_count: row.reading_count,
      });
    }
  }

  return result;
}

export async function getDashboardLive(
  deviceIds: string[],
  sparklineStart: string,
  sparklineBucketMinutes = 15
): Promise<DashboardLiveData> {
  const empty: DashboardLiveData = { sensor: {}, weather: {}, sparklines: {} };
  if (!supabase || deviceIds.length === 0) return empty;

  const { data, error } = await supabase.rpc('get_dashboard_live', {
    p_device_ids: deviceIds,
    p_sparkline_start: sparklineStart,
    p_sparkline_bucket_minutes: sparklineBucketMinutes,
  });

  if (error) {
    console.error('Error fetching dashboard live:', error);
    return empty;
  }

  return parseDashboardLiveRows(deviceIds, data || []);
}

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

  if (params.maxRows) {
    let query = supabase
      .from('readings')
      .select('*')
      .gte('created_at', params.start)
      .lte('created_at', params.end)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(params.maxRows);

    if (params.device_id) {
      query = query.eq('device_id', params.device_id);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching readings range:', error);
      return [];
    }
    return data || [];
  }

  const pageSize = 1000;
  const rows: Reading[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    let query = supabase
      .from('readings')
      .select('*')
      .gte('created_at', params.start)
      .lte('created_at', params.end)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to);

    if (params.device_id) {
      query = query.eq('device_id', params.device_id);
    }

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching readings range:', error);
      return [];
    }
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
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

  if (params.maxRows) {
    const { data, error } = await supabase
      .rpc('get_chart_samples', {
        p_start: params.start,
        p_end: params.end,
        p_bucket_minutes: bucketMinutes,
        p_device_id: params.device_id || null,
      })
      .limit(params.maxRows);

    if (error) {
      console.error('Error fetching chart samples:', error.message || error.code || JSON.stringify(error));
      return [];
    }
    return data || [];
  }

  const pageSize = 1000;
  const rows: ChartSample[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .rpc('get_chart_samples', {
        p_start: params.start,
        p_end: params.end,
        p_bucket_minutes: bucketMinutes,
        p_device_id: params.device_id || null,
      })
      .range(from, to);

    if (error) {
      console.error('Error fetching chart samples:', error.message || error.code || JSON.stringify(error));
      return [];
    }
    const page = (data || []) as ChartSample[];
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

export interface ReadingsFilter {
  start: string;
  end: string;
  deviceIds?: string[];
  source?: 'sensor' | 'weather' | 'both';
  minTempC?: number;
  maxTempC?: number;
  minHumidity?: number;
  maxHumidity?: number;
  deploymentId?: number;
  sort?: 'asc' | 'desc';
  limit?: number;
}

const PAGE_SIZE = 1000;
export const FILTERED_READINGS_CEILING = 50_000;

export interface FilteredReadingsResult {
  readings: Reading[];
  truncated: boolean;
  ceiling: number;
}

export async function getFilteredReadings(filter: ReadingsFilter): Promise<FilteredReadingsResult> {
  const ceiling = filter.limit ?? FILTERED_READINGS_CEILING;
  if (!supabase) return { readings: [], truncated: false, ceiling };

  const client = supabase;
  const source = filter.source ?? 'both';
  const sortDir = filter.sort ?? 'desc';

  const buildBaseQuery = () => {
    let q = client
      .from('readings')
      .select('*')
      .gte('created_at', filter.start)
      .lte('created_at', filter.end)
      .order('created_at', { ascending: sortDir === 'asc' })
      .order('id', { ascending: sortDir === 'asc' });

    if (filter.deviceIds && filter.deviceIds.length > 0) {
      q = q.in('device_id', filter.deviceIds);
    }
    if (source !== 'both') {
      q = q.eq('source', source);
    }
    if (filter.minTempC != null) q = q.gte('temperature', filter.minTempC);
    if (filter.maxTempC != null) q = q.lte('temperature', filter.maxTempC);
    if (filter.minHumidity != null) q = q.gte('humidity', filter.minHumidity);
    if (filter.maxHumidity != null) q = q.lte('humidity', filter.maxHumidity);
    if (filter.deploymentId != null) q = q.eq('deployment_id', filter.deploymentId);
    return q;
  };

  const rows: Reading[] = [];
  let truncated = false;
  for (let from = 0; from < ceiling; from += PAGE_SIZE) {
    const to = Math.min(ceiling - 1, from + PAGE_SIZE - 1);
    const { data, error } = await buildBaseQuery().range(from, to);
    if (error) {
      console.error('Error fetching filtered readings:', error);
      break;
    }
    const page = data ?? [];
    rows.push(...page);
    if (page.length < to - from + 1) break;
    if (rows.length >= ceiling) {
      truncated = true;
      break;
    }
  }
  return { readings: rows, truncated, ceiling };
}

export async function deleteReadingById(id: number): Promise<boolean> {
  if (!supabase) return false;
  const { data, error } = await supabase.rpc('delete_reading_by_id', { p_id: id });
  if (error) {
    console.error('Error deleting reading:', error);
    throw error;
  }
  return data === true;
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
