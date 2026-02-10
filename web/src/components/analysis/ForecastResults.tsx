'use client';

import type { ForecastResult } from '@/lib/analysisRunner';

interface ForecastResultsProps {
  results: ForecastResult[];
}

const CHART_HEIGHT = 200;
const CHART_PADDING_LEFT = 48;
const CHART_PADDING_RIGHT = 8;
const CHART_PADDING_Y = 12;

interface ForecastChartProps {
  result: ForecastResult;
  color: string;
}

function ForecastChart({ result, color }: ForecastChartProps) {
  const { historical, forecast } = result;

  if (historical.values.length < 2) {
    return (
      <div
        className="bg-white/5 rounded-lg border border-white/10 flex items-center justify-center"
        style={{ height: CHART_HEIGHT }}
      >
        <span className="text-xs text-[#a0aec0]">No data</span>
      </div>
    );
  }

  const allValues = [...historical.values, ...forecast.values];
  const minVal = Math.min(...allValues);
  const maxVal = Math.max(...allValues);
  const range = maxVal - minVal || 1;

  const totalPoints = historical.values.length + forecast.values.length;
  const svgWidth = 1000;
  const svgHeight = CHART_HEIGHT;
  const drawLeft = CHART_PADDING_LEFT;
  const drawRight = svgWidth - CHART_PADDING_RIGHT;
  const drawWidth = drawRight - drawLeft;
  const drawTop = CHART_PADDING_Y;
  const drawBottom = svgHeight - CHART_PADDING_Y;
  const drawHeight = drawBottom - drawTop;

  const toX = (i: number) =>
    drawLeft + (i / Math.max(totalPoints - 1, 1)) * drawWidth;
  const toY = (v: number) =>
    drawBottom - ((v - minVal) / range) * drawHeight;

  let histPath = '';
  for (let i = 0; i < historical.values.length; i++) {
    const x = toX(i);
    const y = toY(historical.values[i]);
    if (i === 0) {
      histPath = `M${x.toFixed(2)},${y.toFixed(2)}`;
    } else {
      histPath += ` L${x.toFixed(2)},${y.toFixed(2)}`;
    }
  }

  const fcStartIdx = historical.values.length - 1;
  let fcPath = '';
  {
    const x = toX(fcStartIdx);
    const y = toY(historical.values[historical.values.length - 1]);
    fcPath = `M${x.toFixed(2)},${y.toFixed(2)}`;
  }
  for (let i = 0; i < forecast.values.length; i++) {
    const x = toX(historical.values.length + i);
    const y = toY(forecast.values[i]);
    fcPath += ` L${x.toFixed(2)},${y.toFixed(2)}`;
  }

  const boundaryX = toX(historical.values.length - 1);

  const fmtVal = (v: number) => {
    if (Math.abs(v) >= 100) return v.toFixed(0);
    if (Math.abs(v) >= 1) return v.toFixed(1);
    return v.toFixed(2);
  };

  const midVal = (minVal + maxVal) / 2;

  return (
    <div
      className="bg-white/5 rounded-lg border border-white/10 relative"
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
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
        <line
          x1={drawLeft}
          y1={(drawTop + drawBottom) / 2}
          x2={drawRight}
          y2={(drawTop + drawBottom) / 2}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />
        <line
          x1={drawLeft}
          y1={drawBottom}
          x2={drawRight}
          y2={drawBottom}
          stroke="rgba(255,255,255,0.05)"
          strokeWidth="1"
        />

        <line
          x1={boundaryX}
          y1={drawTop}
          x2={boundaryX}
          y2={drawBottom}
          stroke="rgba(255,255,255,0.5)"
          strokeWidth="1.5"
          strokeDasharray="6,4"
          vectorEffect="non-scaling-stroke"
        />

        <path
          d={histPath}
          fill="none"
          stroke={color}
          strokeWidth="2"
          opacity={0.9}
          vectorEffect="non-scaling-stroke"
        />

        <path
          d={fcPath}
          fill="none"
          stroke={color}
          strokeWidth="2"
          opacity={0.6}
          strokeDasharray="8,4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      <span
        className="absolute text-[10px] text-[#a0aec0] font-mono"
        style={{ top: CHART_PADDING_Y - 2, left: 4 }}
      >
        {fmtVal(maxVal)}
      </span>
      <span
        className="absolute text-[10px] text-[#a0aec0] font-mono"
        style={{ top: '50%', left: 4, transform: 'translateY(-50%)' }}
      >
        {fmtVal(midVal)}
      </span>
      <span
        className="absolute text-[10px] text-[#a0aec0] font-mono"
        style={{ bottom: CHART_PADDING_Y - 2, left: 4 }}
      >
        {fmtVal(minVal)}
      </span>

      <span
        className="absolute text-[10px] text-[#a0aec0]/60 font-mono"
        style={{
          top: 4,
          right: CHART_PADDING_RIGHT + 4,
        }}
      >
        forecast
      </span>
    </div>
  );
}

interface ForecastCardProps {
  result: ForecastResult;
}

function ForecastCard({ result }: ForecastCardProps) {
  const isTemp = result.metric === 'temperature';
  const color = isTemp ? '#0075ff' : '#01b574';
  const badgeLabel = isTemp ? 'Temperature' : 'Humidity';
  const badgeBg = isTemp
    ? 'bg-blue-500/20 text-blue-400'
    : 'bg-green-500/20 text-green-400';

  const { alpha, beta, gamma, aic } = result.model_params;

  return (
    <div className="glass-card p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {result.deployment_name}
          </h3>
          <p className="text-sm text-[#a0aec0]">{result.location}</p>
        </div>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-medium ${badgeBg}`}
        >
          {badgeLabel}
        </span>
      </div>

      <ForecastChart result={result} color={color} />

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
        <div className="text-xs">
          <span className="text-[#a0aec0]">Alpha: </span>
          <span className="text-white font-mono">{alpha.toFixed(4)}</span>
        </div>
        <div className="text-xs">
          <span className="text-[#a0aec0]">Beta: </span>
          <span className="text-white font-mono">{beta.toFixed(4)}</span>
        </div>
        <div className="text-xs">
          <span className="text-[#a0aec0]">Gamma: </span>
          <span className="text-white font-mono">{gamma.toFixed(4)}</span>
        </div>
        <div className="text-xs">
          <span className="text-[#a0aec0]">AIC: </span>
          <span className="text-white font-mono">{aic.toFixed(2)}</span>
        </div>
      </div>

      <p className="mt-3 text-xs text-[#a0aec0]">
        Holt-Winters triple exponential smoothing with daily seasonality.
        Forecast: next {result.forecast_hours} hours.
      </p>
    </div>
  );
}

export function ForecastResults({ results }: ForecastResultsProps) {
  if (!results || results.length === 0) {
    return (
      <div className="text-sm text-[#a0aec0] text-center py-8">
        Insufficient data — need at least 2 days of continuous readings for
        forecasting.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {results.map((result, i) => (
        <ForecastCard
          key={`${result.deployment_id}-${result.metric}-${i}`}
          result={result}
        />
      ))}
    </div>
  );
}
