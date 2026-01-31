import { createClient } from '@supabase/supabase-js';
import {
  DeploymentWithCount,
  DeploymentStats,
  Reading,
  Deployment,
  celsiusToFahrenheit,
} from './supabase';

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
    p_deployment_ids: cappedIds,
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
    .order('created_at', { ascending: true });

  if (deployment.ended_at) {
    query = query.lte('created_at', deployment.ended_at);
  }

  // Cap readings to prevent abuse (default 100, max 500)
  const limit = Math.min(params.limit || 100, 500);
  query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching deployment readings:', error);
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
    case 'get_deployments':
      return executeGetDeployments(params as Parameters<typeof executeGetDeployments>[0]);
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
      // Convert temps to Fahrenheit
      return readings.map((r) => ({
        ...r,
        temperature_f: celsiusToFahrenheit(r.temperature),
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
