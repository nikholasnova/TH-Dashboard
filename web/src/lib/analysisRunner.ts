import type { PyodideInterface } from './pyodide';
import { getActiveDeployment, getDeployments, getDeploymentReadings, getChartSamples, celsiusToFahrenheit } from './supabase';
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
  anova?: AnovaResult[] | { error: string };
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
  standard_error: number;
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
  ci_lower: number;
  ci_upper: number;
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

export interface AnovaResult {
  metric: 'temperature' | 'humidity';
  f_statistic: number;
  p_value: number;
  significant: boolean;
  df_between: number;
  df_within: number;
  groups: { deployment_id: number; name: string; mean: number; std: number; n: number }[];
  tukey_results?: { group_a: string; group_b: string; mean_diff: number; p_adj: number; reject: boolean }[];
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

interface AnalysisFetchOptions {
  useDeploymentBounds?: boolean;
  maxRows?: number;
  deploymentsById?: Map<number, DeploymentWithCount>;
}

async function fetchReadingsForAnalysis(
  deploymentIds: number[],
  start: string,
  end: string,
  options: AnalysisFetchOptions = {}
): Promise<ReadingWithContext[]> {
  let deploymentsById = options.deploymentsById;
  if (!deploymentsById) {
    const allDeployments = await getDeployments();
    deploymentsById = new Map<number, DeploymentWithCount>();
    for (const d of allDeployments) {
      deploymentsById.set(d.id, d);
    }
  }

  const combined: ReadingWithContext[] = [];

  for (const depId of deploymentIds) {
    const dep = deploymentsById.get(depId);
    if (!dep) continue;

    const requestedStart = options.useDeploymentBounds ? dep.started_at : start;
    const requestedEnd = options.useDeploymentBounds ? (dep.ended_at || end) : end;

    const readings = await getDeploymentReadings(depId, options.maxRows, {
      start: requestedStart,
      end: requestedEnd,
      preferLatest: Boolean(options.maxRows),
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
if df.empty:
    df = pd.DataFrame(columns=['created_at', 'temperature', 'humidity', 'deployment_id', 'deployment_name', 'location'])
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
            'standard_error': safe_float(std_val / (count ** 0.5), 0.0) if count > 0 else 0.0,
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

            # Welch-Satterthwaite degrees of freedom + 95% CI for difference in means
            n_a_val = int(len(a_vals))
            n_b_val = int(len(b_vals))
            se_diff = ((std_a**2 / n_a_val) + (std_b**2 / n_b_val))**0.5 if n_a_val > 0 and n_b_val > 0 else 0.0
            if se_diff > 0 and n_a_val > 1 and n_b_val > 1:
                num = (std_a**2 / n_a_val + std_b**2 / n_b_val)**2
                denom = (std_a**2 / n_a_val)**2 / (n_a_val - 1) + (std_b**2 / n_b_val)**2 / (n_b_val - 1)
                df_welch = num / denom if denom > 0 else 1.0
                from scipy.stats import t as t_dist
                ci_low, ci_high = t_dist.interval(0.95, df_welch, loc=mean_a - mean_b, scale=se_diff)
                ci_lower = safe_float(ci_low, 0.0)
                ci_upper = safe_float(ci_high, 0.0)
            else:
                ci_lower = 0.0
                ci_upper = 0.0

            results.append({
                'deployment_a': {'id': int(dep_a), 'name': dep_meta.get(dep_a, {}).get('name', str(dep_a))},
                'deployment_b': {'id': int(dep_b), 'name': dep_meta.get(dep_b, {}).get('name', str(dep_b))},
                'metric': metric,
                'mean_a': mean_a,
                'mean_b': mean_b,
                'std_a': std_a,
                'std_b': std_b,
                'n_a': n_a_val,
                'n_b': n_b_val,
                't_statistic': t_stat,
                'p_value': p_value,
                'significant': bool(p_value < 0.05),
                'effect_size': effect,
                'ci_lower': ci_lower,
                'ci_upper': ci_upper,
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
        if len(regular) == 0:
            continue

        last_ts = regular.index[-1]
        if not (last_ts.hour == 23 and last_ts.minute == 45):
            regular = regular[regular.index < last_ts.floor('D')]
        if len(regular) == 0:
            continue

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

            hist_step = max(1, len(regular) // 1200)
            hist_timestamps = [t.isoformat() for t in regular.index[::hist_step]]
            hist_values = [
                safe_float(v, 0.0)
                for v in regular.values[::hist_step].tolist()
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

const ANOVA_SCRIPT = `
from scipy import stats as scipy_stats

results = []
groups = df.groupby('deployment_id')
dep_meta = {}
for _, row in df.drop_duplicates('deployment_id').iterrows():
    dep_meta[row['deployment_id']] = {
        'id': int(row['deployment_id']),
        'name': row['deployment_name'],
    }

if len(groups) >= 3:
    for metric, col in [('temperature', 'temperature_f'), ('humidity', 'humidity')]:
        group_data = []
        group_info = []
        for dep_id, group in groups:
            vals = group[col].dropna()
            if len(vals) > 1:
                group_data.append(vals.values)
                group_info.append({
                    'deployment_id': int(dep_id),
                    'name': dep_meta.get(dep_id, {}).get('name', str(dep_id)),
                    'mean': safe_float(vals.mean(), 0.0),
                    'std': safe_float(vals.std(), 0.0),
                    'n': int(len(vals)),
                })

        if len(group_data) >= 3:
            f_stat_raw, p_value_raw = scipy_stats.f_oneway(*group_data)
            f_stat = safe_float(f_stat_raw, 0.0)
            p_value = safe_p_value(p_value_raw)
            n_total = sum(len(g) for g in group_data)
            k = len(group_data)

            entry = {
                'metric': metric,
                'f_statistic': f_stat,
                'p_value': p_value,
                'significant': bool(p_value < 0.05),
                'df_between': k - 1,
                'df_within': n_total - k,
                'groups': group_info,
            }

            if p_value < 0.05:
                try:
                    from statsmodels.stats.multicomp import pairwise_tukeyhsd
                    import numpy as _np
                    all_vals = _np.concatenate(group_data)
                    labels = []
                    for i, g in enumerate(group_data):
                        labels.extend([group_info[i]['name']] * len(g))
                    tukey = pairwise_tukeyhsd(all_vals, labels, alpha=0.05)
                    tukey_results = []
                    for row in tukey.summary().data[1:]:
                        tukey_results.append({
                            'group_a': str(row[0]),
                            'group_b': str(row[1]),
                            'mean_diff': safe_float(float(row[2]), 0.0),
                            'p_adj': safe_p_value(float(row[3])),
                            'reject': bool(row[4] if len(row) > 4 else float(row[3]) < 0.05),
                        })
                    entry['tukey_results'] = tukey_results
                except Exception:
                    pass

            results.append(entry)

result_json = dumps_json_safe(results)
`;

export async function runAnalyses(
  pyodide: PyodideInterface,
  params: AnalysisParams,
  onProgress?: (msg: string) => void
): Promise<AnalysisResults> {
  const includeForecasting = params.analyses.includes('forecasting');
  const includeRangeAnalyses = params.analyses.some((a) => a !== 'forecasting');

  const allDeployments = await getDeployments();
  const deploymentsById = new Map<number, DeploymentWithCount>();
  for (const d of allDeployments) {
    deploymentsById.set(d.id, d);
  }

  let rangeReadings: ReadingWithContext[] = [];
  if (includeRangeAnalyses) {
    onProgress?.('Fetching sensor data...');
    rangeReadings = await fetchReadingsForAnalysis(
      params.deploymentIds,
      params.start,
      params.end,
      { maxRows: 5000, deploymentsById }
    );
  }

  let forecastReadings: ReadingWithContext[] = [];
  if (includeForecasting) {
    onProgress?.('Fetching full deployment history for forecasting...');
    forecastReadings = await fetchReadingsForAnalysis(
      params.deploymentIds,
      params.start,
      new Date().toISOString(),
      { useDeploymentBounds: true, deploymentsById }
    );
  }

  const selectedDeployments = allDeployments.filter((d) =>
    params.deploymentIds.includes(d.id)
  );

  const results: AnalysisResults = {};

  for (const analysis of params.analyses) {
    onProgress?.(`Running ${analysis.replace(/_/g, ' ')}...`);
    try {
      const readingsForAnalysis =
        analysis === 'forecasting' ? forecastReadings : rangeReadings;
      pyodide.globals.set('readings_json', JSON.stringify(readingsForAnalysis));
      pyodide.globals.set('deployments_json', JSON.stringify(selectedDeployments));
      await pyodide.runPythonAsync(SETUP_SCRIPT);

      const script = ANALYSIS_SCRIPTS[analysis];
      await pyodide.runPythonAsync(script);
      const resultJson: string = pyodide.globals.get('result_json');
      results[analysis] = JSON.parse(resultJson);
    } catch (error) {
      results[analysis] = { error: String(error) };
    }
  }

  // Auto-run ANOVA when hypothesis_test is selected and 3+ deployments
  if (params.analyses.includes('hypothesis_test') && params.deploymentIds.length >= 3) {
    onProgress?.('Running ANOVA...');
    try {
      pyodide.globals.set('readings_json', JSON.stringify(rangeReadings));
      pyodide.globals.set('deployments_json', JSON.stringify(selectedDeployments));
      await pyodide.runPythonAsync(SETUP_SCRIPT);
      await pyodide.runPythonAsync(ANOVA_SCRIPT);
      const resultJson: string = pyodide.globals.get('result_json');
      results.anova = JSON.parse(resultJson);
    } catch (error) {
      results.anova = { error: String(error) };
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Dashboard 24-hour hourly forecast (standalone, not deployment-scoped)
// ---------------------------------------------------------------------------

export interface HourlyForecast {
  hour_label: string;  // "Now", "1 PM", "2 PM", etc.
  temp_f: number;
  iso: string;         // ISO timestamp for key
}

const DASHBOARD_FORECAST_LOOKBACK_DAYS = 10;
const DASHBOARD_FORECAST_MAX_ROWS = (DASHBOARD_FORECAST_LOOKBACK_DAYS + 2) * 24;

const HOURLY_FORECAST_SCRIPT = `
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
df['bucket_ts'] = pd.to_datetime(df['bucket_ts'], utc=True)
df = df.sort_values('bucket_ts').set_index('bucket_ts')

# Resample to regular 1-hour intervals, interpolate small gaps
series = df['temperature_f'].resample('1h').mean().interpolate(method='linear', limit=3)
series = series.dropna()

period = 24
forecast_steps = 24

result_json = '[]'

if len(series) >= period * 2:
    try:
        series_q05 = safe_float(series.quantile(0.05), safe_float(series.min(), 0.0))
        series_q95 = safe_float(series.quantile(0.95), safe_float(series.max(), 0.0))
        if series_q95 < series_q05:
            series_q05 = safe_float(series.min(), 0.0)
            series_q95 = safe_float(series.max(), 0.0)

        margin = 15.0
        lower_bound = series_q05 - margin
        upper_bound = series_q95 + margin
        if upper_bound - lower_bound < 10.0:
            midpoint = (upper_bound + lower_bound) / 2.0
            lower_bound = midpoint - 5.0
            upper_bound = midpoint + 5.0

        try:
            model = ExponentialSmoothing(
                series,
                seasonal_periods=period,
                trend='add',
                damped_trend=True,
                seasonal='add',
                initialization_method='estimated',
            ).fit(optimized=True)
        except Exception:
            model = ExponentialSmoothing(
                series,
                seasonal_periods=period,
                trend=None,
                seasonal='add',
                initialization_method='estimated',
            ).fit(optimized=True)

        forecast = model.forecast(forecast_steps)
        forecast = np.clip(forecast, lower_bound, upper_bound)

        fc_isos = [t.isoformat() for t in forecast.index]
        fc_values = [round(safe_float(v, 0.0), 1) for v in forecast.values.tolist()]

        result_json = json.dumps([
            {'iso': iso, 'temp_f': val}
            for iso, val in zip(fc_isos, fc_values)
        ], allow_nan=False)
    except Exception as e:
        result_json = json.dumps({"error": str(e)})
`;

const hourFormatter = new Intl.DateTimeFormat(undefined, {
  hour: 'numeric',
  hour12: true,
});

export async function runHourlyForecast(
  pyodide: PyodideInterface,
  deviceId: string,
): Promise<HourlyForecast[]> {
  const now = new Date();
  const activeDeployment = await getActiveDeployment(deviceId);
  if (!activeDeployment) return [];
  const deploymentStartMs = new Date(activeDeployment.started_at).getTime();
  const lookbackStartMs =
    now.getTime() - DASHBOARD_FORECAST_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const effectiveStartMs = Number.isFinite(deploymentStartMs)
    ? Math.max(deploymentStartMs, lookbackStartMs)
    : lookbackStartMs;
  const start = new Date(effectiveStartMs).toISOString();
  const end = now.toISOString();

  const samples = await getChartSamples({
    start,
    end,
    bucketSeconds: 3600,
    device_id: deviceId,
    maxRows: DASHBOARD_FORECAST_MAX_ROWS,
  });

  if (samples.length < 48) return [];

  const samplesWithF = samples.map((s) => ({
    bucket_ts: s.bucket_ts,
    temperature_f: celsiusToFahrenheit(s.temperature_avg),
  }));

  pyodide.globals.set('chart_samples_json', JSON.stringify(samplesWithF));
  await pyodide.runPythonAsync(HOURLY_FORECAST_SCRIPT);

  const resultJson: string = pyodide.globals.get('result_json');
  const parsed = JSON.parse(resultJson);
  if (parsed && typeof parsed === 'object' && 'error' in parsed) {
    throw new Error(`Forecast model failed: ${parsed.error}`);
  }
  const rawPoints = parsed as { iso: string; temp_f: number }[];
  if (!Array.isArray(rawPoints) || rawPoints.length === 0) return [];

  return rawPoints.map((pt, i) => ({
    iso: pt.iso,
    temp_f: pt.temp_f,
    hour_label: i === 0 ? 'Now' : hourFormatter.format(new Date(pt.iso)),
  }));
}
