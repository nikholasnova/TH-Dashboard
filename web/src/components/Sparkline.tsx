'use client';

import { useRef, useEffect, useId } from 'react';

function monotoneCubicPath(xs: number[], ys: number[]): string {
  const n = xs.length;
  if (n < 2) return '';
  if (n === 2) return `M${xs[0].toFixed(1)},${ys[0].toFixed(1)} L${xs[1].toFixed(1)},${ys[1].toFixed(1)}`;

  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(xs[i + 1] - xs[i]);
    dy.push(ys[i + 1] - ys[i]);
    m.push(dy[i] / dx[i]);
  }

  const tangents: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      tangents.push(0);
    } else {
      tangents.push(2 / (1 / m[i - 1] + 1 / m[i]));
    }
  }
  tangents.push(m[n - 2]);

  let path = `M${xs[0].toFixed(1)},${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const seg = dx[i] / 3;
    const cp1x = xs[i] + seg;
    const cp1y = ys[i] + tangents[i] * seg;
    const cp2x = xs[i + 1] - seg;
    const cp2y = ys[i + 1] - tangents[i + 1] * seg;
    path += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${xs[i + 1].toFixed(1)},${ys[i + 1].toFixed(1)}`;
  }
  return path;
}

interface SparklineProps {
  values: number[];
  highlightIndex?: number;
  height?: number;
  stroke?: string;
  animate?: boolean;
}

export function Sparkline({
  values,
  highlightIndex,
  height = 52,
  stroke = 'var(--chart-line)',
  animate = true,
}: SparklineProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const uid = useId();
  const areaGradId = `${uid}-area`;
  const strokeGradId = `${uid}-stroke`;

  useEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    const len = el.getTotalLength();
    el.style.setProperty('--path-length', String(len));
  }, [values]);

  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 1000;
  const h = height;
  const padY = Math.min(10, h * 0.2);
  const padX = 8;

  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < values.length; i++) {
    xs.push(padX + (i / (values.length - 1)) * (w - padX * 2));
    ys.push(h - padY - ((values[i] - min) / range) * (h - padY * 2));
  }

  const linePath = monotoneCubicPath(xs, ys);
  const areaPath = `${linePath} L${xs[xs.length - 1]},${h} L${xs[0]},${h} Z`;

  const hx = highlightIndex != null && highlightIndex >= 0 && highlightIndex < xs.length ? xs[highlightIndex] : null;
  const hy = highlightIndex != null && highlightIndex >= 0 && highlightIndex < ys.length ? ys[highlightIndex] : null;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={areaGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.25" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={strokeGradId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={stroke} stopOpacity="0" />
          <stop offset="30%" stopColor={stroke} stopOpacity="0.4" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0.8" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${areaGradId})`} className={animate ? 'area-fade-in' : undefined} />
      <path
        ref={pathRef}
        d={linePath}
        fill="none"
        stroke={`url(#${strokeGradId})`}
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
        className={animate ? 'sparkline-animate' : undefined}
      />
      {hx != null && hy != null && (
        <circle cx={hx} cy={hy} r={5} fill="var(--error)" stroke="var(--background)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      )}
    </svg>
  );
}
