import type { PyodideInterface } from './pyodide';
import { getDeployments, getDeploymentReadings } from './supabase';
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
  _start: string,
  _end: string
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

    const readings = await getDeploymentReadings(depId, 5000);

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
import pandas as pd
import numpy as np

data = json.loads(readings_json)
df = pd.DataFrame(data)
df['created_at'] = pd.to_datetime(df['created_at'])
df['temperature_f'] = df['temperature'] * 9/5 + 32
df = df.sort_values('created_at')

deployments_info = json.loads(deployments_json)
`;

export const ANALYSIS_SCRIPTS: Record<AnalysisType, string> = {
  descriptive: `
from scipy import stats as scipy_stats
import json

results = []
for (deployment_id, name, location), group in df.groupby(
    [df['deployment_id'], df['deployment_name'], df['location']]
):
    for metric, col in [('temperature', 'temperature_f'), ('humidity', 'humidity')]:
        values = group[col].dropna()
        if len(values) == 0:
            continue
        hist_counts, hist_edges = np.histogram(values, bins=20)
        results.append({
            'deployment_id': int(deployment_id),
            'deployment_name': name,
            'location': location,
            'metric': metric,
            'count': int(len(values)),
            'mean': float(values.mean()),
            'median': float(values.median()),
            'std': float(values.std()),
            'min': float(values.min()),
            'max': float(values.max()),
            'q25': float(values.quantile(0.25)),
            'q75': float(values.quantile(0.75)),
            'skewness': float(scipy_stats.skew(values)),
            'kurtosis': float(scipy_stats.kurtosis(values)),
            'histogram': {
                'counts': hist_counts.tolist(),
                'bin_edges': hist_edges.tolist(),
            }
        })

result_json = json.dumps(results)
`,
  correlation: `
from scipy import stats as scipy_stats
import json

results = []
for (dep_id, name, location), group in df.groupby(
    [df['deployment_id'], df['deployment_name'], df['location']]
):
    temp = group['temperature_f'].dropna()
    hum = group['humidity'].dropna()
    common = temp.index.intersection(hum.index)
    t, h = temp[common], hum[common]

    if len(t) > 2:
        r, p_val = scipy_stats.pearsonr(t, h)
        slope, intercept, _, _, _ = scipy_stats.linregress(t, h)

        step = max(1, len(t) // 500)
        results.append({
            'deployment_id': int(dep_id),
            'deployment_name': name,
            'location': location,
            'pearson_r': float(r),
            'p_value': float(p_val),
            'r_squared': float(r**2),
            'regression_slope': float(slope),
            'regression_intercept': float(intercept),
            'n_points': int(len(t)),
            'scatter_data': [
                {'x': float(tv), 'y': float(hv)}
                for tv, hv in zip(t.values[::step], h.values[::step])
            ],
        })

result_json = json.dumps(results)
`,
  hypothesis_test: `
from scipy import stats as scipy_stats
from itertools import combinations
import json

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
            t_stat, p_value = scipy_stats.ttest_ind(a_vals, b_vals, equal_var=False)
            pooled_std = ((a_vals.std()**2 + b_vals.std()**2) / 2)**0.5
            effect = float(abs(a_vals.mean() - b_vals.mean()) / pooled_std) if pooled_std > 0 else 0.0

            results.append({
                'deployment_a': {'id': int(dep_a), 'name': dep_meta.get(dep_a, {}).get('name', str(dep_a))},
                'deployment_b': {'id': int(dep_b), 'name': dep_meta.get(dep_b, {}).get('name', str(dep_b))},
                'metric': metric,
                'mean_a': float(a_vals.mean()),
                'mean_b': float(b_vals.mean()),
                'std_a': float(a_vals.std()),
                'std_b': float(b_vals.std()),
                'n_a': int(len(a_vals)),
                'n_b': int(len(b_vals)),
                't_statistic': float(t_stat),
                'p_value': float(p_value),
                'significant': bool(p_value < 0.05),
                'effect_size': effect,
            })

result_json = json.dumps(results)
`,
  seasonal_decomposition: `
from statsmodels.tsa.seasonal import seasonal_decompose
import json

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
                return [None if (v != v) else float(v) for v in vals]

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

result_json = json.dumps(results)
`,
  forecasting: `
from statsmodels.tsa.holtwinters import ExponentialSmoothing
import json

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
            hist_values = regular.values[hist_cutoff::hist_step].tolist()

            fc_timestamps = [t.isoformat() for t in forecast.index]
            fc_values = forecast.values.tolist()

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
                    'alpha': float(model.params['smoothing_level']),
                    'beta': float(model.params['smoothing_trend']),
                    'gamma': float(model.params['smoothing_seasonal']),
                    'aic': float(model.aic),
                },
            })
        except Exception:
            continue

result_json = json.dumps(results)
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
