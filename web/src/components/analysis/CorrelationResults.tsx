'use client';

import type { CorrelationResult } from '@/lib/analysisRunner';

interface CorrelationResultsProps {
  results: CorrelationResult[];
}

function formatPValue(p: number): string {
  if (p < 0.001) return p.toExponential(2);
  return p.toFixed(4);
}

function interpretCorrelation(r: number, p: number) {
  const absR = Math.abs(r);
  const direction = r >= 0 ? 'positive' : 'negative';

  let strength: string;
  if (absR > 0.7) strength = `Strong ${direction} correlation`;
  else if (absR > 0.4) strength = `Moderate ${direction} correlation`;
  else if (absR > 0.2) strength = `Weak ${direction} correlation`;
  else strength = 'No meaningful correlation';

  const significant = p < 0.05;

  return { strength, significant };
}

// ---------------------------------------------------------------------------
// Scatter plot with regression line (div-based dots + SVG regression overlay)
// ---------------------------------------------------------------------------

interface ScatterPlotProps {
  scatterData: { x: number; y: number }[];
  slope: number;
  intercept: number;
}

const PLOT_WIDTH = 500;
const PLOT_HEIGHT = 300;
const PADDING = 0;

function ScatterPlot({ scatterData, slope, intercept }: ScatterPlotProps) {
  if (scatterData.length === 0) {
    return (
      <div className="text-sm text-[#a0aec0] text-center py-8">
        No data to plot.
      </div>
    );
  }

  const xValues = scatterData.map((d) => d.x);
  const yValues = scatterData.map((d) => d.y);
  const xMin = Math.min(...xValues);
  const xMax = Math.max(...xValues);
  const yMin = Math.min(...yValues);
  const yMax = Math.max(...yValues);

  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const xPadded = { min: xMin - xRange * 0.05, max: xMax + xRange * 0.05 };
  const yPadded = { min: yMin - yRange * 0.05, max: yMax + yRange * 0.05 };

  const toPixelX = (v: number) =>
    ((v - xPadded.min) / (xPadded.max - xPadded.min)) * 100;
  const toPixelY = (v: number) =>
    (1 - (v - yPadded.min) / (yPadded.max - yPadded.min)) * 100;

  const regY1 = slope * xPadded.min + intercept;
  const regY2 = slope * xPadded.max + intercept;

  const lineX1 = (toPixelX(xPadded.min) / 100) * PLOT_WIDTH;
  const lineY1 = (toPixelY(regY1) / 100) * PLOT_HEIGHT;
  const lineX2 = (toPixelX(xPadded.max) / 100) * PLOT_WIDTH;
  const lineY2 = (toPixelY(regY2) / 100) * PLOT_HEIGHT;

  return (
    <div>
      <div
        className="relative bg-white/5 border border-white/10 rounded-lg overflow-hidden"
        style={{ height: PLOT_HEIGHT }}
      >
        {scatterData.map((d, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: 5,
              height: 5,
              backgroundColor: '#0075ff',
              opacity: 0.7,
              left: `${toPixelX(d.x)}%`,
              top: `${toPixelY(d.y)}%`,
              transform: 'translate(-50%, -50%)',
            }}
            title={`Temp: ${d.x.toFixed(1)}\u00B0F, Humidity: ${d.y.toFixed(1)}%`}
          />
        ))}

        <svg
          className="absolute inset-0 pointer-events-none"
          viewBox={`${PADDING} ${PADDING} ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%' }}
        >
          <line
            x1={lineX1}
            y1={lineY1}
            x2={lineX2}
            y2={lineY2}
            stroke="#ff6b6b"
            strokeWidth="2"
            strokeDasharray="6 3"
            opacity={0.8}
          />
        </svg>
      </div>

      <div className="flex justify-between mt-1">
        <span className="text-[10px] text-[#a0aec0]">
          {xMin.toFixed(1)}&deg;F
        </span>
        <span className="text-[10px] text-[#a0aec0]">
          Temperature (&deg;F)
        </span>
        <span className="text-[10px] text-[#a0aec0]">
          {xMax.toFixed(1)}&deg;F
        </span>
      </div>

      <div className="flex justify-between mt-0.5">
        <span className="text-[10px] text-[#a0aec0]">
          Y: Humidity (%)
        </span>
        <span className="text-[10px] text-[#a0aec0]">
          {yMin.toFixed(1)}% &ndash; {yMax.toFixed(1)}%
        </span>
      </div>
    </div>
  );
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

interface CorrelationCardProps {
  result: CorrelationResult;
}

function CorrelationCard({ result }: CorrelationCardProps) {
  const { strength, significant } = interpretCorrelation(
    result.pearson_r,
    result.p_value
  );

  return (
    <div className="glass-card p-4 sm:p-6">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-white">
          {result.deployment_name}
        </h3>
        <p className="text-sm text-[#a0aec0]">{result.location}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <p className="text-xs text-[#a0aec0] mb-2">
            Temperature vs Humidity
          </p>
          <ScatterPlot
            scatterData={result.scatter_data}
            slope={result.regression_slope}
            intercept={result.regression_intercept}
          />
        </div>

        <div>
          <p className="text-xs text-[#a0aec0] mb-2">
            Correlation Statistics
          </p>
          <table className="w-full mb-4">
            <tbody>
              <StatRow
                label="Pearson r"
                value={result.pearson_r.toFixed(4)}
              />
              <StatRow
                label="R\u00B2"
                value={result.r_squared.toFixed(4)}
              />
              <StatRow
                label="p-value"
                value={formatPValue(result.p_value)}
              />
              <StatRow
                label="N points"
                value={result.n_points.toLocaleString()}
              />
              <StatRow
                label="Slope"
                value={result.regression_slope.toFixed(4)}
              />
              <StatRow
                label="Intercept"
                value={result.regression_intercept.toFixed(2)}
              />
            </tbody>
          </table>

          <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10">
            <p className="text-sm text-white font-medium">{strength}</p>
            {significant ? (
              <p className="text-xs mt-1 text-green-400">
                (statistically significant)
              </p>
            ) : (
              <p className="text-xs mt-1 text-[#a0aec0]">
                (not statistically significant)
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function CorrelationResults({ results }: CorrelationResultsProps) {
  if (!results || results.length === 0) {
    return (
      <div className="text-sm text-[#a0aec0] text-center py-8">
        No correlation results to display.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {results.map((result) => (
        <CorrelationCard key={result.deployment_id} result={result} />
      ))}
    </div>
  );
}
