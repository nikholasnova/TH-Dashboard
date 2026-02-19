import {
  DeploymentWithCount,
  DeploymentStats,
  DeviceStats,
  ChartSample,
  Reading,
  celsiusToFahrenheit,
  celsiusDeltaToFahrenheit,
  getServerClient,
} from './supabase';
import { normalizeUsZipCode } from './weatherZip';

const TIMEZONE = 'America/Phoenix';

function safeInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.round(n), min), max);
}

function convertStatsToF<T extends { temp_avg: number | null; temp_min: number | null; temp_max: number | null; temp_stddev: number | null }>(
  stats: T
): T & { temp_avg_f: number | null; temp_min_f: number | null; temp_max_f: number | null; temp_stddev_f: number | null } {
  return {
    ...stats,
    temp_avg_f: stats.temp_avg !== null ? celsiusToFahrenheit(stats.temp_avg) : null,
    temp_min_f: stats.temp_min !== null ? celsiusToFahrenheit(stats.temp_min) : null,
    temp_max_f: stats.temp_max !== null ? celsiusToFahrenheit(stats.temp_max) : null,
    temp_stddev_f: stats.temp_stddev !== null ? celsiusDeltaToFahrenheit(stats.temp_stddev) : null,
  };
}

function toLocalTime(utcString: unknown): string {
  if (typeof utcString !== 'string') return '';
  const trimmed = utcString.trim();
  if (!trimmed) return '';

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }

  return parsed.toLocaleString('en-US', { timeZone: TIMEZONE });
}

export async function executeGetDeployments(params: {
  device_id?: string;
  location?: string;
  name?: string;
  active_only?: boolean;
  zip_code?: string;
}): Promise<DeploymentWithCount[]> {
  const supabase = getServerClient();

  const { data, error } = await supabase.rpc('get_deployments_with_counts', {
    p_device_id: params.device_id || null,
    p_active_only: params.active_only || false,
  });

  if (error) {
    throw new Error(`Failed to fetch deployments: ${error.message}`);
  }

  let results = (data || []) as DeploymentWithCount[];

  if (params.location) {
    const loc = params.location.toLowerCase();
    results = results.filter(d => d.location.toLowerCase().includes(loc));
  }
  if (params.name) {
    const name = params.name.toLowerCase();
    results = results.filter(d => d.name.toLowerCase().includes(name));
  }
  if (params.zip_code) {
    results = results.filter(d => d.zip_code === params.zip_code);
  }

  return results;
}

const MAX_DEPLOYMENT_IDS = 100;

export async function executeGetDeploymentStats(params: {
  deployment_ids: number[];
}): Promise<{ stats: DeploymentStats[]; truncated: boolean }> {
  const supabase = getServerClient();

  if (params.deployment_ids.length === 0) return { stats: [], truncated: false };

  const truncated = params.deployment_ids.length > MAX_DEPLOYMENT_IDS;
  const cappedIds = params.deployment_ids.slice(0, MAX_DEPLOYMENT_IDS);

  const { data, error } = await supabase.rpc('get_deployment_stats', {
    deployment_ids: cappedIds,
  });

  if (error) {
    throw new Error(`RPC get_deployment_stats failed: ${error.message} (code: ${error.code})`);
  }

  return { stats: data || [], truncated };
}

export async function executeGetReadings(params: {
  deployment_id: number;
  limit?: number;
}): Promise<Reading[]> {
  const supabase = getServerClient();

  const { data: deployment, error: dError } = await supabase
    .from('deployments')
    .select('*')
    .eq('id', params.deployment_id)
    .single();

  if (dError) {
    throw new Error(`Failed to fetch deployment ${params.deployment_id}: ${dError.message}`);
  }

  if (!deployment) {
    throw new Error(`Deployment ${params.deployment_id} not found`);
  }

  let query = supabase
    .from('readings')
    .select('*')
    .eq('device_id', deployment.device_id)
    .gte('created_at', deployment.started_at)
    .order('created_at', { ascending: false });

  if (deployment.ended_at) {
    query = query.lte('created_at', deployment.ended_at);
  }

  const limit = safeInt(params.limit, 100, 1, 2000);
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch readings for deployment ${params.deployment_id}: ${error.message}`);
  }

  return data || [];
}

export async function executeGetDeviceStats(params: {
  start: string;
  end: string;
  device_id?: string;
}): Promise<DeviceStats[]> {
  const supabase = getServerClient();

  const { data, error } = await supabase.rpc('get_device_stats', {
    p_start: params.start,
    p_end: params.end,
    p_device_id: params.device_id || null,
  });

  if (error) {
    throw new Error(`RPC get_device_stats failed: ${error.message} (code: ${error.code})`);
  }

  return data || [];
}

export async function executeGetChartData(params: {
  start: string;
  end: string;
  bucket_minutes: number;
  device_id?: string;
}): Promise<ChartSample[]> {
  const supabase = getServerClient();

  const { data, error } = await supabase.rpc('get_chart_samples', {
    p_start: params.start,
    p_end: params.end,
    p_bucket_minutes: safeInt(params.bucket_minutes, 60, 1, 1440),
    p_device_id: params.device_id || null,
  });

  if (error) {
    throw new Error(`RPC get_chart_samples failed: ${error.message} (code: ${error.code})`);
  }

  return data || [];
}

export async function executeGetReportData(): Promise<{
  deployments: DeploymentWithCount[];
  deployment_stats: DeploymentStats[];
  overall_device_stats: DeviceStats[];
  data_range: { earliest: string; latest: string };
  total_readings: number;
  note?: string;
}> {
  const deployments = await executeGetDeployments({});

  if (deployments.length === 0) {
    return {
      deployments: [],
      deployment_stats: [],
      overall_device_stats: [],
      data_range: { earliest: '', latest: '' },
      total_readings: 0,
    };
  }

  const allIds = deployments.map((d) => d.id);
  const { stats: deploymentStats, truncated } = await executeGetDeploymentStats({ deployment_ids: allIds });

  const earliest = deployments.reduce(
    (min, d) => (d.started_at < min ? d.started_at : min),
    deployments[0].started_at
  );
  const latest = new Date().toISOString();

  const overallDeviceStats = await executeGetDeviceStats({ start: earliest, end: latest });

  const totalReadings = deployments.reduce((sum, d) => sum + d.reading_count, 0);

  return {
    deployments,
    deployment_stats: deploymentStats,
    overall_device_stats: overallDeviceStats,
    data_range: { earliest, latest },
    total_readings: totalReadings,
    ...(truncated && { note: `Only the first ${MAX_DEPLOYMENT_IDS} deployments were included in stats. Use a narrower time range for complete results.` }),
  };
}

export async function executeGetWeather(params: {
  zip_code?: string;
  device_id?: string;
  limit?: number;
}): Promise<Record<string, unknown>[]> {
  const supabase = getServerClient();

  let query = supabase
    .from('readings')
    .select('*')
    .eq('source', 'weather')
    .order('created_at', { ascending: false });

  if (params.zip_code) {
    const normalized = normalizeUsZipCode(params.zip_code);
    if (!normalized) {
      throw new Error(`Invalid US zip code: "${params.zip_code}". Must be a 5-digit US zip code.`);
    }
    query = query.eq('zip_code', normalized);
  }

  if (params.device_id) {
    query = query.eq('device_id', params.device_id);
  }

  const limit = safeInt(params.limit, 1, 1, 100);
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch weather readings: ${error.message}`);
  }

  return (data || []) as Record<string, unknown>[];
}

export async function executeTool(
  name: string,
  params: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'get_deployments': {
      const deployments = await executeGetDeployments(params as Parameters<typeof executeGetDeployments>[0]);
      return deployments.map((d) => ({
        ...d,
        started_at: toLocalTime(d.started_at),
        ended_at: d.ended_at ? toLocalTime(d.ended_at) : null,
        created_at: toLocalTime(d.created_at),
      }));
    }
    case 'get_deployment_stats': {
      const { stats, truncated } = await executeGetDeploymentStats(params as Parameters<typeof executeGetDeploymentStats>[0]);
      const mapped = stats.map((s) => convertStatsToF(s));
      return {
        stats: mapped,
        ...(truncated ? { note: `Results limited to first ${MAX_DEPLOYMENT_IDS} deployments.` } : {}),
      };
    }
    case 'get_readings': {
      const readings = await executeGetReadings(params as Parameters<typeof executeGetReadings>[0]);
      return readings.map((r) => ({
        ...r,
        created_at: toLocalTime(r.created_at),
        temperature_f: celsiusToFahrenheit(r.temperature),
      }));
    }
    case 'get_device_stats': {
      const deviceStats = await executeGetDeviceStats(params as Parameters<typeof executeGetDeviceStats>[0]);
      return deviceStats.map((s) => convertStatsToF(s));
    }
    case 'get_chart_data': {
      const chartData = await executeGetChartData(params as Parameters<typeof executeGetChartData>[0]);
      return chartData.map((s) => ({
        ...s,
        bucket_ts: toLocalTime(s.bucket_ts),
        temperature_avg_f: celsiusToFahrenheit(s.temperature_avg),
      }));
    }
    case 'get_report_data': {
      const reportData = await executeGetReportData();
      return {
        deployments: reportData.deployments.map((d) => ({
          ...d,
          started_at: toLocalTime(d.started_at),
          ended_at: d.ended_at ? toLocalTime(d.ended_at) : null,
          created_at: toLocalTime(d.created_at),
        })),
        deployment_stats: reportData.deployment_stats.map((s) => convertStatsToF(s)),
        overall_device_stats: reportData.overall_device_stats.map((s) => convertStatsToF(s)),
        data_range: {
          earliest: toLocalTime(reportData.data_range.earliest),
          latest: toLocalTime(reportData.data_range.latest),
        },
        total_readings: reportData.total_readings,
        ...(reportData.note ? { note: reportData.note } : {}),
      };
    }
    case 'get_weather': {
      const weatherReadings = await executeGetWeather(params as Parameters<typeof executeGetWeather>[0]);
      return weatherReadings.map((r) => ({
        ...r,
        created_at: toLocalTime(r.created_at as string),
        observed_at: r.observed_at ? toLocalTime(r.observed_at as string) : null,
        temperature_f: celsiusToFahrenheit(r.temperature as number),
      }));
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
