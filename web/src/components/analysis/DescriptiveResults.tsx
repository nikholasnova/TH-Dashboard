'use client';

import type { DescriptiveResult } from '@/lib/analysisRunner';

interface DescriptiveResultsProps {
  results: DescriptiveResult[];
}

interface StatRowProps {
  label: string;
  value: string;
}

function StatRow({ label, value }: StatRowProps) {
  return (
    <tr className="border-b border-white/5 last:border-b-0">
      <td className="py-1.5 pr-4 text-sm text-[#a0aec0]">{label}</td>
      <td className="py-1.5 text-sm text-white text-right font-mono">
        {value}
      </td>
    </tr>
  );
}

interface HistogramProps {
  counts: number[];
  binEdges: number[];
  color: string;
  unit: string;
}

function Histogram({ counts, binEdges, color, unit }: HistogramProps) {
  const maxCount = Math.max(...counts, 1);

  return (
    <div>
      <div
        className="flex items-end gap-px"
        style={{ height: 120 }}
        role="img"
        aria-label="Histogram"
      >
        {counts.map((count, i) => {
          const heightPct = (count / maxCount) * 100;
          const rangeStart = binEdges[i].toFixed(1);
          const rangeEnd = binEdges[i + 1].toFixed(1);
          return (
            <div
              key={i}
              className="flex-1 rounded-t-sm transition-all hover:opacity-80 relative group"
              style={{
                height: `${heightPct}%`,
                backgroundColor: color,
                minWidth: 0,
                opacity: 0.85,
              }}
              title={`${rangeStart}${unit} - ${rangeEnd}${unit}: ${count}`}
            >
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded bg-black/90 text-xs text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none z-10">
                {rangeStart} - {rangeEnd}
                {unit}: {count}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-[#a0aec0]">
          {binEdges[0].toFixed(1)}
          {unit}
        </span>
        <span className="text-[10px] text-[#a0aec0]">
          {binEdges[binEdges.length - 1].toFixed(1)}
          {unit}
        </span>
      </div>
    </div>
  );
}

interface MetricBlockProps {
  result: DescriptiveResult;
}

function MetricBlock({ result }: MetricBlockProps) {
  const isTemp = result.metric === 'temperature';
  const unit = isTemp ? '\u00B0F' : '%';
  const color = isTemp ? '#0075ff' : '#01b574';
  const label = isTemp ? 'Temperature' : 'Humidity';

  const fmt = (v: number) => `${v.toFixed(2)}${unit}`;

  return (
    <div>
      <h4
        className="text-sm font-semibold mb-3"
        style={{ color }}
      >
        {label}
      </h4>

      <table className="w-full mb-4">
        <tbody>
          <StatRow label="Count" value={result.count.toLocaleString()} />
          <StatRow label="Mean" value={fmt(result.mean)} />
          <StatRow label="Median" value={fmt(result.median)} />
          <StatRow label="Std Dev" value={fmt(result.std)} />
          <StatRow label="Min" value={fmt(result.min)} />
          <StatRow label="Max" value={fmt(result.max)} />
          <StatRow label="Q25 (25th)" value={fmt(result.q25)} />
          <StatRow label="Q75 (75th)" value={fmt(result.q75)} />
          <StatRow label="Skewness" value={result.skewness.toFixed(2)} />
          <StatRow label="Kurtosis" value={result.kurtosis.toFixed(2)} />
        </tbody>
      </table>

      <p className="text-xs text-[#a0aec0] mb-2">Distribution</p>
      <Histogram
        counts={result.histogram.counts}
        binEdges={result.histogram.bin_edges}
        color={color}
        unit={unit}
      />
    </div>
  );
}

export function DescriptiveResults({ results }: DescriptiveResultsProps) {
  if (!results || results.length === 0) {
    return (
      <div className="text-sm text-[#a0aec0] text-center py-8">
        No descriptive statistics to display.
      </div>
    );
  }

  const grouped = new Map<
    number,
    { name: string; location: string; metrics: DescriptiveResult[] }
  >();

  for (const r of results) {
    let entry = grouped.get(r.deployment_id);
    if (!entry) {
      entry = {
        name: r.deployment_name,
        location: r.location,
        metrics: [],
      };
      grouped.set(r.deployment_id, entry);
    }
    entry.metrics.push(r);
  }

  return (
    <div className="space-y-6">
      {Array.from(grouped.entries()).map(([depId, group]) => (
        <div key={depId} className="glass-card p-4 sm:p-6">
          <div className="mb-4">
            <h3 className="text-lg font-semibold text-white">
              {group.name}
            </h3>
            <p className="text-sm text-[#a0aec0]">{group.location}</p>
          </div>

          {/* Temperature + Humidity side by side (stacked on mobile) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {group.metrics.map((metric) => (
              <MetricBlock key={metric.metric} result={metric} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
