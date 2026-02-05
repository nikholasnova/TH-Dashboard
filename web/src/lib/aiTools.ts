import { createClient } from '@supabase/supabase-js';
import {
  DeploymentWithCount,
  DeploymentStats,
  DeviceStats,
  ChartSample,
  Reading,
  Deployment,
  celsiusToFahrenheit,
} from './supabase';

const TIMEZONE = 'America/Phoenix';

// Convert a UTC ISO timestamp to a human-readable Phoenix time string for AI responses
function toLocalTime(utcString: string): string {
  return new Date(utcString).toLocaleString('en-US', { timeZone: TIMEZONE });
}

// Server-side Supabase client for AI tools
// Uses service role key to bypass RLS (auth is verified at API route level)
function getServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error('Supabase configuration missing');
  }

  return createClient(url, key);
}

// Tool execution functions
export async function executeGetDeployments(params: {
  device_id?: string;
  location?: string;
  active_only?: boolean;
}): Promise<DeploymentWithCount[]> {
  const supabase = getServerClient();

  let query = supabase.from('deployments').select('*');

  if (params.device_id) {
    query = query.eq('device_id', params.device_id);
  }

  if (params.location) {
    query = query.eq('location', params.location);
  }

  if (params.active_only) {
    query = query.is('ended_at', null);
  }

  query = query.order('started_at', { ascending: false });

  const { data: deployments, error } = await query;

  if (error || !deployments) {
    console.error('Error fetching deployments:', error);
    return [];
  }

  // Get reading counts for each deployment
  const deploymentsWithCounts: DeploymentWithCount[] = await Promise.all(
    deployments.map(async (d: Deployment) => {
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

// Max deployments to query at once (prevents abuse)
const MAX_DEPLOYMENT_IDS = 20;

export async function executeGetDeploymentStats(params: {
  deployment_ids: number[];
}): Promise<DeploymentStats[]> {
  const supabase = getServerClient();

  if (params.deployment_ids.length === 0) return [];

  // Cap the number of deployment IDs to prevent abuse
  const cappedIds = params.deployment_ids.slice(0, MAX_DEPLOYMENT_IDS);

  const { data, error } = await supabase.rpc('get_deployment_stats', {
    deployment_ids: cappedIds,
  });

  if (error) {
    console.error('Error fetching deployment stats:', error);
    return [];
  }

  return data || [];
}

export async function executeGetReadings(params: {
  deployment_id: number;
  limit?: number;
}): Promise<Reading[]> {
  const supabase = getServerClient();

  // First get the deployment to know time range and device
  const { data: deployment, error: dError } = await supabase
    .from('deployments')
    .select('*')
    .eq('id', params.deployment_id)
    .single();

  if (dError || !deployment) {
    console.error('Error fetching deployment:', dError);
    return [];
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

  // Cap readings (default 100, max 2000 for full analysis)
  const limit = Math.min(params.limit || 100, 2000);
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching deployment readings:', error);
    return [];
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
    console.error('Error fetching device stats:', error);
    return [];
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
    p_bucket_minutes: Math.max(1, Math.round(params.bucket_minutes)),
    p_device_id: params.device_id || null,
  });

  if (error) {
    console.error('Error fetching chart data:', error);
    return [];
  }

  return data || [];
}

// Main tool dispatcher
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
      const stats = await executeGetDeploymentStats(params as Parameters<typeof executeGetDeploymentStats>[0]);
      // Convert temps to Fahrenheit for AI response
      return stats.map((s) => ({
        ...s,
        temp_avg_f: s.temp_avg !== null ? celsiusToFahrenheit(s.temp_avg) : null,
        temp_min_f: s.temp_min !== null ? celsiusToFahrenheit(s.temp_min) : null,
        temp_max_f: s.temp_max !== null ? celsiusToFahrenheit(s.temp_max) : null,
      }));
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
      return deviceStats.map((s) => ({
        ...s,
        temp_avg_f: s.temp_avg !== null ? celsiusToFahrenheit(s.temp_avg) : null,
        temp_min_f: s.temp_min !== null ? celsiusToFahrenheit(s.temp_min) : null,
        temp_max_f: s.temp_max !== null ? celsiusToFahrenheit(s.temp_max) : null,
      }));
    }
    case 'get_chart_data': {
      const chartData = await executeGetChartData(params as Parameters<typeof executeGetChartData>[0]);
      return chartData.map((s) => ({
        ...s,
        bucket_ts: toLocalTime(s.bucket_ts),
        temperature_avg_f: celsiusToFahrenheit(s.temperature_avg),
      }));
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// AI Response interface
export interface AIResponse {
  summary: string;
  data?: {
    comparisons?: Array<{
      deployment: string;
      location: string;
      device: string;
      temp_avg_f: number;
      humidity_avg: number;
      reading_count: number;
    }>;
    stats?: Record<string, {
      temp: { avg: number; min: number; max: number };
      humidity: { avg: number; min: number; max: number };
    }>;
    trends?: Array<{
      observation: string;
      direction: 'up' | 'down' | 'stable';
    }>;
  };
  insights: string[];
  followUp?: string;
}
