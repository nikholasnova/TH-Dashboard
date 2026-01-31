import {
  getDeployments,
  getDeploymentStats,
  getDeploymentReadings,
  DeploymentWithCount,
  DeploymentStats,
  Reading,
  celsiusToFahrenheit,
} from './supabase';

// Tool execution functions
export async function executeGetDeployments(params: {
  device_id?: string;
  location?: string;
  active_only?: boolean;
}): Promise<DeploymentWithCount[]> {
  return getDeployments(params);
}

export async function executeGetDeploymentStats(params: {
  deployment_ids: number[];
}): Promise<DeploymentStats[]> {
  return getDeploymentStats(params.deployment_ids);
}

export async function executeGetReadings(params: {
  deployment_id: number;
  limit?: number;
}): Promise<Reading[]> {
  return getDeploymentReadings(params.deployment_id, params.limit);
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
