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
  owner_id: string | null;
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

export interface DeviceAlertState {
  device_id: string;
  status: 'ok' | 'missing' | 'stale' | 'anomaly';
  last_seen_at: string | null;
  last_alert_type: string | null;
  last_alert_sent_at: string | null;
  last_alert_deployment_id: string | null;
  last_recovery_sent_at: string | null;
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

export interface ReportBundleStats {
  temp_avg: number | null;
  temp_median: number | null;
  temp_min: number | null;
  temp_max: number | null;
  temp_stddev: number | null;
  humidity_avg: number | null;
  humidity_median: number | null;
  humidity_min: number | null;
  humidity_max: number | null;
  humidity_stddev: number | null;
  n: number;
}

export interface ReportBundle {
  window: { start: string; end: string; days: number };
  deployments: Array<{
    id: number;
    device_id: string;
    name: string;
    location: string;
    zip_code: string | null;
    started_at: string;
    ended_at: string | null;
    reading_count: number;
  }>;
  per_deployment_stats: Array<
    ReportBundleStats & {
      deployment_id: number;
      deployment_name: string;
      device_id: string;
    }
  >;
  overall_stats: ReportBundleStats;
  hourly_averages: Array<{
    hour: number;
    temp_avg: number | null;
    humidity_avg: number | null;
    n: number;
  }>;
  daily_comparison: Array<{
    day: string;
    sensor_temp: number | null;
    weather_temp: number | null;
    temp_error_pct: number | null;
    sensor_humidity: number | null;
    weather_humidity: number | null;
    humidity_error_pct: number | null;
  }>;
  pearson_temp_humidity: number | null;
  outliers: Array<{
    day: string;
    metric: 'temperature' | 'humidity';
    value: number;
    bound: 'above' | 'below';
  }>;
  gaps: Array<{
    start: string;
    end: string;
    hours: number;
  }>;
  has_weather_data: boolean;
  has_sensor_data: boolean;
  device_count: number;
  per_device_hourly: Array<{
    device_id: string;
    hour: number;
    temp_avg: number | null;
    humidity_avg: number | null;
    n: number;
  }>;
  per_device_daily: Array<{
    device_id: string;
    day: string;
    temp_min: number | null;
    temp_avg: number | null;
    temp_max: number | null;
    humidity_min: number | null;
    humidity_avg: number | null;
    humidity_max: number | null;
    n: number;
  }>;
  devices_info: Array<{
    id: string;
    display_name: string;
    color: string;
  }>;
}
