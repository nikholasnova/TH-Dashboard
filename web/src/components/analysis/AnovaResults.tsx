'use client';

import type { AnovaResult } from '@/lib/analysisRunner';

interface AnovaResultsProps {
  results: AnovaResult[];
}

function formatPValue(p: number): string {
  if (p < 0.001) return p.toExponential(2);
  return p.toFixed(4);
}

function StatRow({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <tr className="border-b border-[var(--divider)]">
      <td className="py-1.5 pr-4 text-sm text-[var(--foreground-muted)]">{label}</td>
      <td className={`py-1.5 text-sm font-mono text-right ${valueClassName ?? 'text-[var(--foreground)]'}`}>{value}</td>
    </tr>
  );
}

function AnovaCard({ result }: { result: AnovaResult }) {
  const isTemp = result.metric === 'temperature';
  const unit = isTemp ? '\u00B0F' : '%';
  const label = isTemp ? 'Temperature' : 'Humidity';

  return (
    <div
      className="glass-card p-4 sm:p-6"
      style={{ borderLeft: `4px solid ${result.significant ? 'var(--success)' : 'var(--divider)'}` }}
    >
      <h4 className="text-sm font-semibold text-[var(--foreground)] mb-4">{label}</h4>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-[var(--foreground-muted)] mb-2">ANOVA Summary</p>
          <table className="w-full mb-4">
            <tbody>
              <StatRow label="F-statistic" value={result.f_statistic.toFixed(4)} />
              <StatRow
                label="p-value"
                value={formatPValue(result.p_value)}
                valueClassName={result.significant ? 'text-green-400' : 'text-[var(--foreground)]'}
              />
              <StatRow
                label="Significant"
                value={result.significant ? 'Yes (p < 0.05)' : 'No (p >= 0.05)'}
                valueClassName={result.significant ? 'text-green-400' : 'text-[var(--foreground-muted)]'}
              />
              <StatRow label="df (between)" value={String(result.df_between)} />
              <StatRow label="df (within)" value={String(result.df_within)} />
            </tbody>
          </table>

          <p className="text-xs text-[var(--foreground-muted)] mb-2">Group Means</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--divider)]">
                  <th className="py-1.5 text-left text-[var(--foreground-muted)] font-medium">Group</th>
                  <th className="py-1.5 text-right text-[var(--foreground-muted)] font-medium">Mean</th>
                  <th className="py-1.5 text-right text-[var(--foreground-muted)] font-medium">Std</th>
                  <th className="py-1.5 text-right text-[var(--foreground-muted)] font-medium">N</th>
                </tr>
              </thead>
              <tbody>
                {result.groups.map(g => (
                  <tr key={g.deployment_id} className="border-b border-[var(--divider)]">
                    <td className="py-1.5 text-[var(--foreground)] truncate max-w-[150px]">{g.name}</td>
                    <td className="py-1.5 text-right font-mono text-[var(--foreground)]">{g.mean.toFixed(2)}{unit}</td>
                    <td className="py-1.5 text-right font-mono text-[var(--foreground-muted)]">{g.std.toFixed(2)}</td>
                    <td className="py-1.5 text-right font-mono text-[var(--foreground-muted)]">{g.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div>
          {result.significant && result.tukey_results && result.tukey_results.length > 0 ? (
            <>
              <p className="text-xs text-[var(--foreground-muted)] mb-2">Tukey HSD Post-Hoc</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--divider)]">
                      <th className="py-1.5 text-left text-[var(--foreground-muted)] font-medium">Pair</th>
                      <th className="py-1.5 text-right text-[var(--foreground-muted)] font-medium">Diff</th>
                      <th className="py-1.5 text-right text-[var(--foreground-muted)] font-medium">p (adj)</th>
                      <th className="py-1.5 text-right text-[var(--foreground-muted)] font-medium">Sig</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.tukey_results.map((t, i) => (
                      <tr key={i} className="border-b border-[var(--divider)]">
                        <td className="py-1.5 text-[var(--foreground)] text-xs">{t.group_a} vs {t.group_b}</td>
                        <td className="py-1.5 text-right font-mono text-[var(--foreground)]">{t.mean_diff.toFixed(2)}{unit}</td>
                        <td className="py-1.5 text-right font-mono text-[var(--foreground)]">{formatPValue(t.p_adj)}</td>
                        <td className={`py-1.5 text-right font-mono ${t.reject ? 'text-green-400' : 'text-[var(--foreground-muted)]'}`}>
                          {t.reject ? 'Yes' : 'No'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : result.significant ? (
            <p className="text-sm text-[var(--foreground-muted)]">Post-hoc analysis unavailable.</p>
          ) : (
            <div className="p-3 rounded-lg bg-[var(--hover-bg)]">
              <p className="text-sm text-[var(--foreground-muted)]">
                No significant difference found between groups (F = {result.f_statistic.toFixed(2)}, p = {formatPValue(result.p_value)}).
                Pairwise post-hoc tests are not needed.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AnovaResults({ results }: AnovaResultsProps) {
  if (!results || results.length === 0) return null;
  return (
    <div className="space-y-4">
      {results.map((r, i) => (
        <AnovaCard key={i} result={r} />
      ))}
    </div>
  );
}
