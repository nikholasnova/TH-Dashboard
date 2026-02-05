'use client';

import type { HypothesisTestResult } from '@/lib/analysisRunner';

interface HypothesisTestResultsProps {
  results: HypothesisTestResult[];
}

function formatPValue(p: number): string {
  if (p < 0.001) return p.toExponential(2);
  return p.toFixed(4);
}

function formatValue(value: number, metric: 'temperature' | 'humidity'): string {
  const unit = metric === 'temperature' ? '\u00B0F' : '%';
  return `${value.toFixed(2)}${unit}`;
}

function interpretEffectSize(d: number): { label: string; color: string } {
  if (d < 0.2) return { label: 'Negligible', color: 'text-[#a0aec0]' };
  if (d < 0.5) return { label: 'Small', color: 'text-yellow-400' };
  if (d < 0.8) return { label: 'Medium', color: 'text-orange-400' };
  return { label: 'Large', color: 'text-red-400' };
}

function getEvidenceLevel(p: number): string {
  if (p < 0.001) return 'very strong evidence';
  if (p < 0.01) return 'strong evidence';
  if (p < 0.05) return 'evidence';
  return 'insufficient evidence';
}

interface StatRowProps {
  label: string;
  value: string;
  valueClassName?: string;
}

function StatRow({ label, value, valueClassName }: StatRowProps) {
  return (
    <tr className="border-b border-white/5 last:border-b-0">
      <td className="py-1.5 pr-4 text-sm text-[#a0aec0]">{label}</td>
      <td
        className={`py-1.5 text-sm text-right font-mono ${valueClassName ?? 'text-white'}`}
      >
        {value}
      </td>
    </tr>
  );
}

interface HypothesisCardProps {
  result: HypothesisTestResult;
}

function HypothesisCard({ result }: HypothesisCardProps) {
  const isTemp = result.metric === 'temperature';
  const metricLabel = isTemp ? 'Temperature' : 'Humidity';
  const metricColor = isTemp ? '#0075ff' : '#01b574';
  const unit = isTemp ? '\u00B0F' : '%';
  const delta = Math.abs(result.mean_a - result.mean_b);
  const effectInfo = interpretEffectSize(result.effect_size);
  const evidenceLevel = getEvidenceLevel(result.p_value);

  const borderClass = result.significant
    ? 'border-l-4 border-l-[#01b574]'
    : 'border-l-4 border-l-white/10';

  return (
    <div className={`glass-card p-4 sm:p-6 ${borderClass}`}>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <h3 className="text-lg font-semibold text-white">
          {result.deployment_a.name} vs {result.deployment_b.name}
        </h3>
        <span
          className="px-2 py-0.5 rounded text-xs font-medium"
          style={{
            backgroundColor: `${metricColor}20`,
            color: metricColor,
          }}
        >
          {metricLabel}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-[#a0aec0] mb-2">Comparison</p>
          <div className="overflow-x-auto">
          <table className="w-full mb-4 min-w-[320px]">
            <thead>
              <tr className="border-b border-white/10">
                <th className="py-1.5 text-left text-xs text-[#a0aec0] font-medium">
                  Deployment
                </th>
                <th className="py-1.5 text-right text-xs text-[#a0aec0] font-medium">
                  Mean
                </th>
                <th className="py-1.5 text-right text-xs text-[#a0aec0] font-medium">
                  Std Dev
                </th>
                <th className="py-1.5 text-right text-xs text-[#a0aec0] font-medium">
                  N
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-white/5">
                <td className="py-1.5 text-sm text-white">
                  {result.deployment_a.name}
                </td>
                <td className="py-1.5 text-sm text-white text-right font-mono">
                  {formatValue(result.mean_a, result.metric)}
                </td>
                <td className="py-1.5 text-sm text-white text-right font-mono">
                  {formatValue(result.std_a, result.metric)}
                </td>
                <td className="py-1.5 text-sm text-white text-right font-mono">
                  {result.n_a.toLocaleString()}
                </td>
              </tr>
              <tr className="border-b border-white/5">
                <td className="py-1.5 text-sm text-white">
                  {result.deployment_b.name}
                </td>
                <td className="py-1.5 text-sm text-white text-right font-mono">
                  {formatValue(result.mean_b, result.metric)}
                </td>
                <td className="py-1.5 text-sm text-white text-right font-mono">
                  {formatValue(result.std_b, result.metric)}
                </td>
                <td className="py-1.5 text-sm text-white text-right font-mono">
                  {result.n_b.toLocaleString()}
                </td>
              </tr>
              <tr className="border-b border-white/5 last:border-b-0">
                <td className="py-1.5 text-sm text-[#a0aec0] italic">
                  Delta
                </td>
                <td className="py-1.5 text-sm text-white text-right font-mono">
                  {delta.toFixed(2)}{unit}
                </td>
                <td className="py-1.5 text-sm text-right font-mono text-[#a0aec0]">
                  &mdash;
                </td>
                <td className="py-1.5 text-sm text-right font-mono text-[#a0aec0]">
                  &mdash;
                </td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>

        <div>
          <p className="text-xs text-[#a0aec0] mb-2">Test Results</p>
          <table className="w-full mb-4">
            <tbody>
              <StatRow
                label="t-statistic"
                value={result.t_statistic.toFixed(4)}
              />
              <StatRow
                label="p-value"
                value={formatPValue(result.p_value)}
                valueClassName={result.significant ? 'text-green-400' : 'text-white'}
              />
              <StatRow
                label="Significant"
                value={result.significant ? 'Yes (p < 0.05)' : 'No (p >= 0.05)'}
                valueClassName={result.significant ? 'text-green-400' : 'text-[#a0aec0]'}
              />
              <StatRow
                label="Cohen\u2019s d"
                value={result.effect_size.toFixed(2)}
              />
              <StatRow
                label="Effect Size"
                value={effectInfo.label}
                valueClassName={effectInfo.color}
              />
            </tbody>
          </table>

          <div
            className={`mt-3 p-3 rounded-lg ${
              result.significant
                ? 'bg-green-500/10 border border-green-500/20'
                : 'bg-white/5 border border-white/10'
            }`}
          >
            <p className="text-sm text-white">
              There is {evidenceLevel} that{' '}
              <span className="font-medium">{result.deployment_a.name}</span>{' '}
              and{' '}
              <span className="font-medium">{result.deployment_b.name}</span>{' '}
              have different mean {metricLabel.toLowerCase()} (t&nbsp;={' '}
              <span className="font-mono">
                {result.t_statistic.toFixed(2)}
              </span>
              , p&nbsp;={' '}
              <span className="font-mono">
                {formatPValue(result.p_value)}
              </span>
              ).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HypothesisTestResults({ results }: HypothesisTestResultsProps) {
  if (!results || results.length === 0) {
    return (
      <div className="text-sm text-[#a0aec0] text-center py-8">
        No hypothesis test results to display. Select at least two deployments
        to compare.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {results.map((result, i) => (
        <HypothesisCard
          key={`${result.deployment_a.id}-${result.deployment_b.id}-${result.metric}-${i}`}
          result={result}
        />
      ))}
    </div>
  );
}
