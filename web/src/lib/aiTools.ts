import {
  DeploymentWithCount,
  DeploymentStats,
  DeviceStats,
  ChartSample,
  Reading,
  ReportBundle,
  celsiusToFahrenheit,
  celsiusDeltaToFahrenheit,
  getServerClient,
} from './supabase';
import { normalizeUsZipCode } from './weatherZip';
import { storeBundle } from './reportStore';

export interface ToolContext {
  user?: {
    id: string;
    email?: string | null;
    user_metadata?: Record<string, unknown> | null;
  } | null;
}

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

  // Normalize for fuzzy matching: lowercase, strip non-alphanumeric (except spaces)
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '');

  if (params.location) {
    const loc = normalize(params.location);
    results = results.filter(d => normalize(d.location).includes(loc));
  }
  if (params.name) {
    const name = normalize(params.name);
    results = results.filter(d => normalize(d.name).includes(name));
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

const VALID_ORDER_BY = ['created_at', 'temperature', 'humidity'] as const;
type OrderByField = typeof VALID_ORDER_BY[number];

export async function executeGetReadings(params: {
  deployment_id: number;
  limit?: number;
  order_by?: string;
  ascending?: boolean;
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

  const orderField: OrderByField = VALID_ORDER_BY.includes(params.order_by as OrderByField)
    ? (params.order_by as OrderByField)
    : 'created_at';
  const ascending = params.ascending ?? (orderField === 'created_at' ? false : true);

  let query = supabase
    .from('readings')
    .select('*')
    .eq('device_id', deployment.device_id)
    .gte('created_at', deployment.started_at)
    .order(orderField, { ascending });

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
  start?: string;
  end?: string;
  device_id?: string;
}): Promise<DeviceStats[]> {
  const supabase = getServerClient();

  const end = params.end || new Date().toISOString();
  const start = params.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase.rpc('get_device_stats', {
    p_start: start,
    p_end: end,
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

export async function executeGetReportBundle(params: {
  start: string;
  end: string;
  device_ids?: string[];
}): Promise<ReportBundle> {
  const supabase = getServerClient();
  const { data, error } = await supabase.rpc('get_report_bundle', {
    p_start: params.start,
    p_end: params.end,
    p_device_ids: params.device_ids && params.device_ids.length > 0 ? params.device_ids : null,
  });
  if (error) {
    throw new Error(`RPC get_report_bundle failed: ${error.message} (code: ${error.code})`);
  }
  const bundle = (Array.isArray(data) ? data[0] : data) as ReportBundle;
  return bundle;
}

function convTemp(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : celsiusToFahrenheit(v);
}

function convTempDelta(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : celsiusDeltaToFahrenheit(v);
}

export function convertReportBundleToF(bundle: ReportBundle): ReportBundle {
  return {
    ...bundle,
    per_deployment_stats: bundle.per_deployment_stats.map((s) => ({
      ...s,
      temp_avg: convTemp(s.temp_avg),
      temp_median: convTemp(s.temp_median),
      temp_min: convTemp(s.temp_min),
      temp_max: convTemp(s.temp_max),
      temp_stddev: convTempDelta(s.temp_stddev),
    })),
    overall_stats: {
      ...bundle.overall_stats,
      temp_avg: convTemp(bundle.overall_stats.temp_avg),
      temp_median: convTemp(bundle.overall_stats.temp_median),
      temp_min: convTemp(bundle.overall_stats.temp_min),
      temp_max: convTemp(bundle.overall_stats.temp_max),
      temp_stddev: convTempDelta(bundle.overall_stats.temp_stddev),
    },
    hourly_averages: bundle.hourly_averages.map((h) => ({
      ...h,
      temp_avg: convTemp(h.temp_avg),
    })),
    daily_comparison: bundle.daily_comparison.map((d) => ({
      ...d,
      sensor_temp: convTemp(d.sensor_temp),
      weather_temp: convTemp(d.weather_temp),
    })),
    outliers: bundle.outliers.map((o) => ({
      ...o,
      value: o.metric === 'temperature' ? (convTemp(o.value) ?? o.value) : o.value,
    })),
    per_device_hourly: bundle.per_device_hourly.map((h) => ({
      ...h,
      temp_avg: convTemp(h.temp_avg),
    })),
    per_device_daily: bundle.per_device_daily.map((d) => ({
      ...d,
      temp_min: convTemp(d.temp_min),
      temp_avg: convTemp(d.temp_avg),
      temp_max: convTemp(d.temp_max),
    })),
  };
}

export interface PrepareReportResult {
  status: 'awaiting_input' | 'error';
  context_id?: string;
  question_payload?: {
    context_id: string;
    prefills: {
      title: string;
      author: string;
      institution: string;
      include_gaps_note: boolean;
      split_by_device: boolean;
      include_weather_section: boolean;
    };
    summary: {
      date_range: string;
      days: number;
      device_count: number;
      reading_count: number;
      has_weather: boolean;
      gap_count: number;
    };
  };
  error?: string;
}

function authorFromUser(user: ToolContext['user']): string {
  if (!user) return 'Author';
  const meta = user.user_metadata ?? {};
  const displayName = typeof meta.display_name === 'string' ? meta.display_name.trim() : '';
  if (displayName) return displayName;
  const fullName = typeof meta.full_name === 'string' ? meta.full_name.trim() : '';
  if (fullName) return fullName;
  const email = user.email ?? '';
  if (email) return email.split('@')[0];
  return 'Author';
}

function yyyymmddFromIso(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function friendlyDateRange(startIso: string, endIso: string): string {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleDateString('en-US', {
      timeZone: 'America/Phoenix',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  return `${fmt(startIso)} to ${fmt(endIso)}`;
}

const MAX_REPORT_WINDOW_DAYS = 365;

export async function executePrepareReport(
  params: { start: string; end: string; device_ids?: string[] },
  ctx: ToolContext,
): Promise<PrepareReportResult> {
  const startDate = new Date(params.start);
  const endDate = new Date(params.end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return { status: 'error', error: 'Invalid ISO 8601 timestamps for start/end.' };
  }
  if (endDate.getTime() <= startDate.getTime()) {
    return { status: 'error', error: 'end must be later than start.' };
  }
  const rangeDays = (endDate.getTime() - startDate.getTime()) / 86400000;
  if (rangeDays > MAX_REPORT_WINDOW_DAYS) {
    return {
      status: 'error',
      error: `Window too large. Max ${MAX_REPORT_WINDOW_DAYS} days per report.`,
    };
  }

  const bundle = await executeGetReportBundle({
    start: params.start,
    end: params.end,
    device_ids: params.device_ids,
  });

  if (!bundle.has_sensor_data) {
    return {
      status: 'error',
      error: 'No sensor readings in that time window. Try a different range.',
    };
  }

  const contextId = crypto.randomUUID();
  const stored = await storeBundle(contextId, convertReportBundleToF(bundle));
  if (!stored) {
    return {
      status: 'error',
      error: 'Report storage is temporarily unavailable. Please try again.',
    };
  }

  const totalReadings = bundle.deployments.reduce((s, d) => s + d.reading_count, 0);

  return {
    status: 'awaiting_input',
    context_id: contextId,
    question_payload: {
      context_id: contextId,
      prefills: {
        title: `Data Report — ${yyyymmddFromIso(params.start)} to ${yyyymmddFromIso(params.end)}`,
        author: authorFromUser(ctx.user),
        institution: 'Central Arizona College — EGR102',
        include_gaps_note: bundle.gaps.length > 0,
        split_by_device: false,
        include_weather_section: bundle.has_weather_data,
      },
      summary: {
        date_range: friendlyDateRange(params.start, params.end),
        days: Math.round(bundle.window.days),
        device_count: bundle.device_count,
        reading_count: totalReadings > 0 ? totalReadings : bundle.overall_stats.n,
        has_weather: bundle.has_weather_data,
        gap_count: bundle.gaps.length,
      },
    },
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
    case 'get_report_bundle': {
      const bundle = await executeGetReportBundle(params as Parameters<typeof executeGetReportBundle>[0]);
      return convertReportBundleToF(bundle);
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
