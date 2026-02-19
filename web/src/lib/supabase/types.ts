export interface Reading {
  id: number;
  device_id: string;
  temperature: number; // Celsius
  humidity: number;
  created_at: string;
  source?: 'sensor' | 'weather';
  deployment_id?: number | null;
  zip_code?: string | null;
  observed_at?: string | null;
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
  zip_code: string | null;
  started_at: string;
  ended_at: string | null;
  created_at: string;
}

export interface DeploymentWithCount extends Deployment {
  reading_count: number;
}

export interface Device {
  id: string;
  display_name: string;
  color: string;
  is_active: boolean;
  monitor_enabled: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
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

