'use client';

import type { SeasonalResult } from '@/lib/analysisRunner';

interface SeasonalResultsProps {
  results: SeasonalResult[];
}

const CHART_HEIGHT = 120;
const CHART_PADDING_LEFT = 40;
const CHART_PADDING_RIGHT = 8;
const CHART_PADDING_Y = 8;

interface DecompChartProps {
  label: string;
  data: (number | null)[];
  color: string;
}

function DecompChart({ label, data, color }: DecompChartProps) {
  // Filter to valid (non-null) segments for path building
  const validPoints: { index: number; value: number }[] = [];
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v !== null && v !== undefined) {
      validPoints.push({ index: i, value: v });
    }
  }

  if (validPoints.length < 2) {
    return (
      <div>
        <p className="text-[var(--foreground-muted)] text-xs mb-1">{label}</p>
        <div
          className="bg-[var(--hover-bg)] rounded-lg flex items-center justify-center"
          style={{ height: CHART_HEIGHT }}
        >
          <span className="text-xs text-[var(--foreground-muted)]">No data</span>
        </div>
      </div>
    );
  }

  const values = validPoints.map((p) => p.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const totalPoints = data.length;
  const svgWidth = 1000;
  const svgHeight = CHART_HEIGHT;
  const drawLeft = CHART_PADDING_LEFT;
  const drawRight = svgWidth - CHART_PADDING_RIGHT;
  const drawWidth = drawRight - drawLeft;
  const drawTop = CHART_PADDING_Y;
  const drawBottom = svgHeight - CHART_PADDING_Y;
  const drawHeight = drawBottom - drawTop;

  // Build path segments (break on nulls)
  const segments: string[] = [];
  let currentPath = '';
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (v === null || v === undefined) {
      if (currentPath) {
        segments.push(currentPath);
        currentPath = '';
      }
      continue;
    }
    const x = drawLeft + (i / Math.max(totalPoints - 1, 1)) * drawWidth;
    const y = drawBottom - ((v - minVal) / range) * drawHeight;
    if (!currentPath) {
      currentPath = `M${x.toFixed(2)},${y.toFixed(2)}`;
    } else {
      currentPath += ` L${x.toFixed(2)},${y.toFixed(2)}`;
    }
  }
  if (currentPath) segments.push(currentPath);

  const fmtVal = (v: number) => {
    if (Math.abs(v) >= 100) return v.toFixed(0);
    if (Math.abs(v) >= 1) return v.toFixed(1);
    return v.toFixed(2);
  };

  return (
    <div>
      <p className="text-[var(--foreground-muted)] text-xs mb-1">{label}</p>
      <div
        className="bg-[var(--hover-bg)] rounded-lg relative"
        style={{ height: CHART_HEIGHT }}
      >
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full"
          style={{ width: '100%', height: '100%' }}
        >
          <line
            x1={drawLeft}
            y1={drawTop}
            x2={drawRight}
            y2={drawTop}
            stroke="var(--chart-grid)"
            strokeWidth="1"
          />
          <line
            x1={drawLeft}
            y1={(drawTop + drawBottom) / 2}
            x2={drawRight}
            y2={(drawTop + drawBottom) / 2}
            stroke="var(--chart-grid)"
            strokeWidth="1"
          />
          <line
            x1={drawLeft}
            y1={drawBottom}
            x2={drawRight}
            y2={drawBottom}
            stroke="var(--chart-grid)"
            strokeWidth="1"
          />

          {segments.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={color}
              strokeWidth="2"
              opacity={0.9}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>

        <span
          className="absolute text-[10px] text-[var(--foreground-muted)] font-mono"
          style={{ top: CHART_PADDING_Y - 2, left: 4 }}
        >
          {fmtVal(maxVal)}
        </span>
        <span
          className="absolute text-[10px] text-[var(--foreground-muted)] font-mono"
          style={{ bottom: CHART_PADDING_Y - 2, left: 4 }}
        >
          {fmtVal(minVal)}
        </span>
      </div>
    </div>
  );
}

interface SeasonalCardProps {
  result: SeasonalResult;
}

function SeasonalCard({ result }: SeasonalCardProps) {
  const isTemp = result.metric === 'temperature';
  const color = isTemp ? 'var(--info)' : 'var(--success)';
  const badgeLabel = isTemp ? 'Temperature' : 'Humidity';
  const badgeBg = isTemp ? 'bg-[var(--hover-bg)] text-[var(--foreground)]' : 'bg-[var(--hover-bg)] text-[var(--foreground-secondary)]';

  return (
    <div className="glass-card p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--foreground)]">
            {result.deployment_name}
          </h3>
          <p className="text-sm text-[var(--foreground-muted)]">{result.location}</p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-medium ${badgeBg}`}
        >
          {badgeLabel}
        </span>
      </div>

      <div className="space-y-3">
        <DecompChart label="Observed" data={result.observed} color={color} />
        <DecompChart label="Trend" data={result.trend} color={color} />
        <DecompChart label="Seasonal" data={result.seasonal} color={color} />
        <DecompChart label="Residual" data={result.residual} color={color} />
      </div>

      <p className="mt-4 text-xs text-[var(--foreground-muted)]">
        Period: {result.period_minutes / 60} hours (daily cycle). Data resampled
        to 15-minute intervals.
      </p>
    </div>
  );
}

export function SeasonalResults({ results }: SeasonalResultsProps) {
  if (!results || results.length === 0) {
    return (
      <div className="text-sm text-[var(--foreground-muted)] text-center py-8">
        Insufficient data — need at least 2 days of continuous readings for
        seasonal decomposition.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {results.map((result, i) => (
        <SeasonalCard
          key={`${result.deployment_id}-${result.metric}-${i}`}
          result={result}
        />
      ))}
    </div>
  );
}
