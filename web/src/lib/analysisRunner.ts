import type { PyodideInterface } from './pyodide';
import { getDeployments, getDeploymentReadings, getChartSamples, celsiusToFahrenheit } from './supabase';
import type { DeploymentWithCount } from './supabase';

export type AnalysisType =
  | 'descriptive'
  | 'correlation'
  | 'hypothesis_test'
  | 'seasonal_decomposition'
  | 'forecasting';

export interface AnalysisParams {
  deploymentIds: number[];
  start: string; // ISO datetime
  end: string;
  analyses: AnalysisType[];
}

export interface AnalysisResults {
  descriptive?: DescriptiveResult[] | { error: string };
  correlation?: CorrelationResult[] | { error: string };
  hypothesis_test?: HypothesisTestResult[] | { error: string };
  seasonal_decomposition?: SeasonalResult[] | { error: string };
  forecasting?: ForecastResult[] | { error: string };
}

export interface DescriptiveResult {
  deployment_id: number;
  deployment_name: string;
  location: string;
  metric: 'temperature' | 'humidity';
  count: number;
  mean: number;
  median: number;
  std: number;
  min: number;
  max: number;
  q25: number;
  q75: number;
  skewness: number;
  kurtosis: number;
  histogram: { counts: number[]; bin_edges: number[] };
}

export interface CorrelationResult {
  deployment_id: number;
  deployment_name: string;
  location: string;
  pearson_r: number;
  p_value: number;
  r_squared: number;
  regression_slope: number;
  regression_intercept: number;
  n_points: number;
  scatter_data: { x: number; y: number }[];
}

export interface HypothesisTestResult {
  deployment_a: { id: number; name: string };
  deployment_b: { id: number; name: string };
  metric: 'temperature' | 'humidity';
  mean_a: number;
  mean_b: number;
  std_a: number;
  std_b: number;
  n_a: number;
  n_b: number;
  t_statistic: number;
  p_value: number;
  significant: boolean;
  effect_size: number;
}

export interface SeasonalResult {
  deployment_id: number;
  deployment_name: string;
  location: string;
  metric: 'temperature' | 'humidity';
  period_minutes: number;
  timestamps: string[];
  observed: (number | null)[];
  trend: (number | null)[];
  seasonal: (number | null)[];
  residual: (number | null)[];
}

export interface ForecastResult {
  deployment_id: number;
  deployment_name: string;
  location: string;
  metric: 'temperature' | 'humidity';
  forecast_hours: number;
  historical: { timestamps: string[]; values: number[] };
  forecast: { timestamps: string[]; values: number[] };
  model_params: { alpha: number; beta: number; gamma: number; aic: number };
}

interface ReadingWithContext {
  id: number;
  temperature: number; // Celsius from DB
  humidity: number;
  created_at: string;
  deployment_id: number;
  deployment_name: string;
  location: string;
}

async function fetchReadingsForAnalysis(
  deploymentIds: number[],
  start: string,
  end: string
): Promise<ReadingWithContext[]> {
  const allDeployments = await getDeployments();
  const deploymentsById = new Map<number, DeploymentWithCount>();
  for (const d of allDeployments) {
    deploymentsById.set(d.id, d);
  }

  const combined: ReadingWithContext[] = [];

  for (const depId of deploymentIds) {
    const dep = deploymentsById.get(depId);
    if (!dep) continue;

    const readings = await getDeploymentReadings(depId, 5000, {
      start,
      end,
      preferLatest: true,
    });

    for (const r of readings) {
      combined.push({
        id: r.id,
        temperature: r.temperature,
        humidity: r.humidity,
        created_at: r.created_at,
        deployment_id: dep.id,
        deployment_name: dep.name,
        location: dep.location,
      });
    }
  }

  return combined;
}

export const SETUP_SCRIPT = `
import json
import math
import pandas as pd
import numpy as np

data = json.loads(readings_json)
df = pd.DataFrame(data)
df['created_at'] = pd.to_datetime(df['created_at'])
df['temperature_f'] = df['temperature'] * 9/5 + 32
df = df.sort_values('created_at')

deployments_info = json.loads(deployments_json)

def safe_float(value, fallback=0.0):
    try:
        v = float(value)
    except Exception:
        return float(fallback)
    if math.isfinite(v):
        return v
    return float(fallback)

def safe_p_value(value):
    p = safe_float(value, 1.0)
    if p < 0:
        return 0.0
    if p > 1:
        return 1.0
    return p

def safe_optional_float(value):
    try:
        v = float(value)
    except Exception:
        return None
    if math.isfinite(v):
        return v
    return None

def sanitize_for_json(value):
    if isinstance(value, dict):
        return {k: sanitize_for_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [sanitize_for_json(v) for v in value]
    if isinstance(value, tuple):
        return [sanitize_for_json(v) for v in value]
    if isinstance(value, (np.floating, float)):
        return safe_float(value, 0.0)
    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, (np.bool_, bool)):
        return bool(value)
    return value

def dumps_json_safe(value):
    return json.dumps(sanitize_for_json(value), allow_nan=False)
`;

export const ANALYSIS_SCRIPTS: Record<AnalysisType, string> = {
  descriptive: `
from scipy import stats as scipy_stats

results = []
for (deployment_id, name, location), group in df.groupby(
    [df['deployment_id'], df['deployment_name'], df['location']]
):
    for metric, col in [('temperature', 'temperature_f'), ('humidity', 'humidity')]:
        values = group[col].dropna()
        count = int(len(values))
        if count == 0:
            continue

        hist_counts, hist_edges = np.histogram(values, bins=20)
        std_val = safe_float(values.std(), 0.0) if count > 1 else 0.0
        skew_val = safe_float(scipy_stats.skew(values), 0.0) if count > 2 and std_val > 0 else 0.0
        kurtosis_val = safe_float(scipy_stats.kurtosis(values), 0.0) if count > 3 and std_val > 0 else 0.0

        results.append({
            'deployment_id': int(deployment_id),
            'deployment_name': name,
            'location': location,
            'metric': metric,
            'count': count,
            'mean': safe_float(values.mean(), 0.0),
            'median': safe_float(values.median(), 0.0),
            'std': std_val,
            'min': safe_float(values.min(), 0.0),
            'max': safe_float(values.max(), 0.0),
            'q25': safe_float(values.quantile(0.25), 0.0),
            'q75': safe_float(values.quantile(0.75), 0.0),
            'skewness': skew_val,
            'kurtosis': kurtosis_val,
            'histogram': {
                'counts': hist_counts.tolist(),
                'bin_edges': hist_edges.tolist(),
            }
        })

result_json = dumps_json_safe(results)
`,
  correlation: `
from scipy import stats as scipy_stats

results = []
for (dep_id, name, location), group in df.groupby(
    [df['deployment_id'], df['deployment_name'], df['location']]
):
    temp = group['temperature_f'].dropna()
    hum = group['humidity'].dropna()
    common = temp.index.intersection(hum.index)
    t, h = temp[common], hum[common]

    if len(t) > 2:
        t_std = safe_float(t.std(), 0.0)
        h_std = safe_float(h.std(), 0.0)

        if t_std > 0 and h_std > 0:
            r_raw, p_raw = scipy_stats.pearsonr(t, h)
            slope_raw, intercept_raw, _, _, _ = scipy_stats.linregress(t, h)
            r = safe_float(r_raw, 0.0)
            p_val = safe_p_value(p_raw)
            slope = safe_float(slope_raw, 0.0)
            intercept = safe_float(intercept_raw, safe_float(h.mean(), 0.0))
        else:
            r = 0.0
            p_val = 1.0
            slope = 0.0
            intercept = safe_float(h.mean(), 0.0)

        step = max(1, len(t) // 500)
        results.append({
            'deployment_id': int(dep_id),
            'deployment_name': name,
            'location': location,
            'pearson_r': r,
            'p_value': p_val,
            'r_squared': safe_float(r**2, 0.0),
            'regression_slope': slope,
            'regression_intercept': intercept,
            'n_points': int(len(t)),
            'scatter_data': [
                {'x': safe_float(tv, 0.0), 'y': safe_float(hv, 0.0)}
                for tv, hv in zip(t.values[::step], h.values[::step])
            ],
        })

result_json = dumps_json_safe(results)
`,
  hypothesis_test: `
from scipy import stats as scipy_stats
from itertools import combinations

results = []
groups = df.groupby('deployment_id')
deployment_pairs = list(combinations(groups.groups.keys(), 2))

dep_meta = {}
for _, row in df.drop_duplicates('deployment_id').iterrows():
    dep_meta[row['deployment_id']] = {
        'name': row['deployment_name'],
        'location': row['location']
    }

for dep_a, dep_b in deployment_pairs:
    group_a = groups.get_group(dep_a)
    group_b = groups.get_group(dep_b)

    for metric, col in [('temperature', 'temperature_f'), ('humidity', 'humidity')]:
        a_vals = group_a[col].dropna()
        b_vals = group_b[col].dropna()

        if len(a_vals) > 1 and len(b_vals) > 1:
            mean_a = safe_float(a_vals.mean(), 0.0)
            mean_b = safe_float(b_vals.mean(), 0.0)
            std_a = safe_float(a_vals.std(), 0.0)
            std_b = safe_float(b_vals.std(), 0.0)

            t_stat_raw, p_value_raw = scipy_stats.ttest_ind(a_vals, b_vals, equal_var=False)
            t_stat = safe_float(t_stat_raw, 0.0)
            p_value = safe_p_value(p_value_raw)

            pooled_std = safe_float(((std_a**2 + std_b**2) / 2)**0.5, 0.0)
            effect = safe_float(abs(mean_a - mean_b) / pooled_std, 0.0) if pooled_std > 0 else 0.0

            results.append({
                'deployment_a': {'id': int(dep_a), 'name': dep_meta.get(dep_a, {}).get('name', str(dep_a))},
                'deployment_b': {'id': int(dep_b), 'name': dep_meta.get(dep_b, {}).get('name', str(dep_b))},
                'metric': metric,
                'mean_a': mean_a,
                'mean_b': mean_b,
                'std_a': std_a,
                'std_b': std_b,
                'n_a': int(len(a_vals)),
                'n_b': int(len(b_vals)),
                't_statistic': t_stat,
                'p_value': p_value,
                'significant': bool(p_value < 0.05),
                'effect_size': effect,
            })

result_json = dumps_json_safe(results)
`,
  seasonal_decomposition: `
from statsmodels.tsa.seasonal import seasonal_decompose

results = []
for (dep_id, name, location), group in df.groupby(
    [df['deployment_id'], df['deployment_name'], df['location']]
):
    group = group.sort_values('created_at').set_index('created_at')

    for metric, col in [('temperature', 'temperature_f'), ('humidity', 'humidity')]:
        series = group[col].dropna()

        regular = series.resample('15min').mean().interpolate(method='linear', limit=4)
        regular = regular.dropna()

        period = 96  # 24h / 15min
        if len(regular) < period * 2:
            continue

        try:
            decomp = seasonal_decompose(regular, model='additive', period=period)

            step = max(1, len(regular) // 1000)
            timestamps = [t.isoformat() for t in regular.index[::step]]

            def safe_list(arr):
                vals = arr.values[::step]
                return [safe_optional_float(v) for v in vals]

            results.append({
                'deployment_id': int(dep_id),
                'deployment_name': name,
                'location': location,
                'metric': metric,
                'period_minutes': 15 * period,
                'timestamps': timestamps,
                'observed': safe_list(decomp.observed),
                'trend': safe_list(decomp.trend),
                'seasonal': safe_list(decomp.seasonal),
                'residual': safe_list(decomp.resid),
            })
        except Exception:
            continue

result_json = dumps_json_safe(results)
`,
  forecasting: `
from statsmodels.tsa.holtwinters import ExponentialSmoothing

FORECAST_HOURS = 24

results = []
for (dep_id, name, location), group in df.groupby(
    [df['deployment_id'], df['deployment_name'], df['location']]
):
    group = group.sort_values('created_at').set_index('created_at')

    for metric, col in [('temperature', 'temperature_f'), ('humidity', 'humidity')]:
        series = group[col].dropna()

        regular = series.resample('15min').mean().interpolate(method='linear', limit=4)
        regular = regular.dropna()

        period = 96  # Daily cycle
        if len(regular) < period * 2:
            continue

        try:
            model = ExponentialSmoothing(
                regular,
                seasonal_periods=period,
                trend='add',
                seasonal='add',
                initialization_method='estimated',
            ).fit(optimized=True)

            forecast_steps = FORECAST_HOURS * 4
            forecast = model.forecast(forecast_steps)

            hist_cutoff = max(0, len(regular) - 7 * 96)
            hist_step = max(1, (len(regular) - hist_cutoff) // 500)
            hist_timestamps = [t.isoformat() for t in regular.index[hist_cutoff::hist_step]]
            hist_values = [
                safe_float(v, 0.0)
                for v in regular.values[hist_cutoff::hist_step].tolist()
            ]

            fc_timestamps = [t.isoformat() for t in forecast.index]
            fc_values = [safe_float(v, 0.0) for v in forecast.values.tolist()]

            results.append({
                'deployment_id': int(dep_id),
                'deployment_name': name,
                'location': location,
                'metric': metric,
                'forecast_hours': FORECAST_HOURS,
                'historical': {
                    'timestamps': hist_timestamps,
                    'values': hist_values,
                },
                'forecast': {
                    'timestamps': fc_timestamps,
                    'values': fc_values,
                },
                'model_params': {
                    'alpha': safe_float(model.params['smoothing_level'], 0.0),
                    'beta': safe_float(model.params['smoothing_trend'], 0.0),
                    'gamma': safe_float(model.params['smoothing_seasonal'], 0.0),
                    'aic': safe_float(model.aic, 0.0),
                },
            })
        except Exception:
            continue

result_json = dumps_json_safe(results)
`,
};

export async function runAnalyses(
  pyodide: PyodideInterface,
  params: AnalysisParams,
  onProgress?: (msg: string) => void
): Promise<AnalysisResults> {
  onProgress?.('Fetching sensor data...');
  const readings = await fetchReadingsForAnalysis(
    params.deploymentIds,
    params.start,
    params.end
  );
  const deployments = await getDeployments();
  const selectedDeployments = deployments.filter((d) =>
    params.deploymentIds.includes(d.id)
  );

  pyodide.globals.set('readings_json', JSON.stringify(readings));
  pyodide.globals.set('deployments_json', JSON.stringify(selectedDeployments));

  await pyodide.runPythonAsync(SETUP_SCRIPT);

  const results: AnalysisResults = {};

  for (const analysis of params.analyses) {
    onProgress?.(`Running ${analysis.replace(/_/g, ' ')}...`);
    try {
      const script = ANALYSIS_SCRIPTS[analysis];
      await pyodide.runPythonAsync(script);
      const resultJson: string = pyodide.globals.get('result_json');
      results[analysis] = JSON.parse(resultJson);
    } catch (error) {
      results[analysis] = { error: String(error) };
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Dashboard 7-day forecast (standalone, not deployment-scoped)
// ---------------------------------------------------------------------------

export interface DailyForecast {
  date: string;        // YYYY-MM-DD
  day_name: string;    // "Today", "Mon", "Tue", etc.
  temp_high_f: number;
  temp_low_f: number;
}

const DASHBOARD_FORECAST_SCRIPT = `
from statsmodels.tsa.holtwinters import ExponentialSmoothing
import json, math
import pandas as pd
import numpy as np

def safe_float(value, fallback=0.0):
    try:
        v = float(value)
    except Exception:
        return float(fallback)
    if math.isfinite(v):
        return v
    return float(fallback)

data = json.loads(chart_samples_json)
df = pd.DataFrame(data)
df['bucket_ts'] = pd.to_datetime(df['bucket_ts'])
df = df.sort_values('bucket_ts').set_index('bucket_ts')

series = df['temperature_f'].dropna()

period = 24  # 24h / 1h = 24 intervals per day
forecast_steps = 7 * period  # 7 days

result_json = '[]'

if len(series) >= period * 2:
    try:
        model = ExponentialSmoothing(
            series,
            seasonal_periods=period,
            trend='add',
            seasonal='add',
            initialization_method='estimated',
        ).fit(optimized=True)

        forecast = model.forecast(forecast_steps)
        fc_timestamps = [t.isoformat() for t in forecast.index]
        fc_values = [safe_float(v, 0.0) for v in forecast.values.tolist()]

        result_json = json.dumps({
            'timestamps': fc_timestamps,
            'values': fc_values,
        })
    except Exception:
        result_json = '[]'
`;

export async function runDashboardForecast(
  pyodide: PyodideInterface,
  deviceId: string,
): Promise<DailyForecast[]> {
  const now = new Date();
  const start = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString();
  const end = now.toISOString();

  const samples = await getChartSamples({
    start,
    end,
    bucketSeconds: 3600, // 1-hour buckets for better data coverage
    device_id: deviceId,
    maxRows: 5000, // 180 days × 24h = 4320 rows max
  });

  if (samples.length < 48) return []; // need at least 2 days (2 × 24)

  // Convert temps to Fahrenheit before sending to Python
  const samplesWithF = samples.map((s) => ({
    bucket_ts: s.bucket_ts,
    temperature_f: celsiusToFahrenheit(s.temperature_avg),
  }));

  pyodide.globals.set('chart_samples_json', JSON.stringify(samplesWithF));
  await pyodide.runPythonAsync(DASHBOARD_FORECAST_SCRIPT);

  const resultJson: string = pyodide.globals.get('result_json');
  const raw = JSON.parse(resultJson);

  if (!raw || !raw.timestamps || raw.timestamps.length === 0) return [];

  // Aggregate hourly forecast points into daily high/low
  const dailyMap = new Map<string, { highs: number[]; lows: number[] }>();
  const todayStr = now.toISOString().slice(0, 10);

  for (let i = 0; i < raw.timestamps.length; i++) {
    const dateStr = raw.timestamps[i].slice(0, 10);
    if (!dailyMap.has(dateStr)) {
      dailyMap.set(dateStr, { highs: [], lows: [] });
    }
    dailyMap.get(dateStr)!.highs.push(raw.values[i]);
    dailyMap.get(dateStr)!.lows.push(raw.values[i]);
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const result: DailyForecast[] = [];

  for (const [dateStr, { highs, lows }] of dailyMap) {
    const dayDate = new Date(dateStr + 'T12:00:00');
    result.push({
      date: dateStr,
      day_name: dateStr === todayStr ? 'Today' : dayNames[dayDate.getDay()],
      temp_high_f: Math.max(...highs),
      temp_low_f: Math.min(...lows),
    });
  }

  return result.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 7);
}
