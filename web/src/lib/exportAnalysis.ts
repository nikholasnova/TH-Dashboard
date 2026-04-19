import type { DescriptiveResult, CorrelationResult, HypothesisTestResult, SeasonalResult, ForecastResult } from './analysisRunner';
import { downloadCsv } from './csv';

export function exportDescriptive(results: DescriptiveResult[]) {
  const headers = ['deployment', 'location', 'metric', 'count', 'mean', 'median', 'std', 'std_error', 'min', 'max', 'q25', 'q75', 'skewness', 'kurtosis'];
  const rows = results.map(r => [
    r.deployment_name, r.location, r.metric,
    r.count, r.mean.toFixed(2), r.median.toFixed(2), r.std.toFixed(2), r.standard_error.toFixed(4),
    r.min.toFixed(2), r.max.toFixed(2), r.q25.toFixed(2), r.q75.toFixed(2),
    r.skewness.toFixed(4), r.kurtosis.toFixed(4),
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadCsv(csv, 'descriptive-stats.csv');
}

export function exportCorrelation(results: CorrelationResult[]) {
  const headers = ['deployment', 'location', 'pearson_r', 'r_squared', 'p_value', 'slope', 'intercept', 'n_points'];
  const rows = results.map(r => [
    r.deployment_name, r.location,
    r.pearson_r.toFixed(4), r.r_squared.toFixed(4), r.p_value.toFixed(6),
    r.regression_slope.toFixed(4), r.regression_intercept.toFixed(4), r.n_points,
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadCsv(csv, 'correlation.csv');
}

export function exportHypothesisTest(results: HypothesisTestResult[]) {
  const headers = ['deployment_a', 'deployment_b', 'metric', 'mean_a', 'mean_b', 'std_a', 'std_b', 'n_a', 'n_b', 't_statistic', 'p_value', 'significant', 'effect_size', 'ci_lower', 'ci_upper'];
  const rows = results.map(r => [
    r.deployment_a.name, r.deployment_b.name, r.metric,
    r.mean_a.toFixed(2), r.mean_b.toFixed(2), r.std_a.toFixed(2), r.std_b.toFixed(2),
    r.n_a, r.n_b, r.t_statistic.toFixed(4), r.p_value.toFixed(6),
    r.significant ? 'yes' : 'no', r.effect_size.toFixed(4),
    r.ci_lower.toFixed(4), r.ci_upper.toFixed(4),
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadCsv(csv, 'hypothesis-tests.csv');
}

export function exportSeasonal(results: SeasonalResult[]) {
  const headers = ['deployment', 'location', 'metric', 'timestamp', 'observed', 'trend', 'seasonal', 'residual'];
  const rows: string[][] = [];
  for (const r of results) {
    for (let i = 0; i < r.timestamps.length; i++) {
      rows.push([
        r.deployment_name, r.location, r.metric, r.timestamps[i],
        r.observed[i]?.toFixed(2) ?? '', r.trend[i]?.toFixed(2) ?? '',
        r.seasonal[i]?.toFixed(2) ?? '', r.residual[i]?.toFixed(2) ?? '',
      ]);
    }
  }
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadCsv(csv, 'seasonal-decomposition.csv');
}

export function exportForecast(results: ForecastResult[]) {
  const headers = ['deployment', 'location', 'metric', 'type', 'timestamp', 'value'];
  const rows: string[][] = [];
  for (const r of results) {
    for (let i = 0; i < r.historical.timestamps.length; i++) {
      rows.push([r.deployment_name, r.location, r.metric, 'historical', r.historical.timestamps[i], r.historical.values[i].toFixed(2)]);
    }
    for (let i = 0; i < r.forecast.timestamps.length; i++) {
      rows.push([r.deployment_name, r.location, r.metric, 'forecast', r.forecast.timestamps[i], r.forecast.values[i].toFixed(2)]);
    }
  }
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  downloadCsv(csv, 'forecast.csv');
}
