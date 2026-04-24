import type { ReportBundle } from './supabase/types';

export interface ReportOptions {
  title: string;
  author: string;
  institution: string;
  include_gaps_note: boolean;
  split_by_device: boolean;
  include_weather_section: boolean;
}

export interface ReportProse {
  coverage_narrative: string | null;
  statistical_summary: string | null;
  diurnal_narrative: string | null;
  accuracy_narrative: string | null;
  error_trend_narrative: string | null;
  outlier_narrative: string | null;
  key_findings: string[];
}

export function latexEscape(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\\/g, '\\textbackslash{}')
    .replace(/&/g, '\\&')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$')
    .replace(/#/g, '\\#')
    .replace(/_/g, '\\_')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replace(/—/g, '---')
    .replace(/–/g, '--')
    .replace(/“|”/g, "''")
    .replace(/‘|’/g, "'")
    .replace(/…/g, '\\ldots{}');
}

function fmt(n: number | null | undefined, digits = 1, suffix = ''): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'n/a';
  return `${n.toFixed(digits)}${suffix}`;
}

function fmtSigned(n: number | null | undefined, digits = 1, suffix = ''): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'n/a';
  const sign = n >= 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}${suffix}`;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/Phoenix',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function fmtShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    timeZone: 'America/Phoenix',
    month: 'short',
    day: 'numeric',
  });
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    timeZone: 'America/Phoenix',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function fmtHour(h: number): string {
  if (h === 0) return '12 AM';
  if (h === 12) return '12 PM';
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}

function pgfplotsDateCoord(iso: string): string {
  // pgfplots date axis wants yyyy-mm-dd
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Sample evenly to cap long tables / dense charts. Always preserves first/last.
function sampleEvenly<T>(arr: T[], maxLen: number): { items: T[]; sampled: boolean } {
  if (arr.length <= maxLen) return { items: arr, sampled: false };
  const step = arr.length / maxLen;
  const out: T[] = [];
  for (let i = 0; i < maxLen; i++) {
    const idx = Math.min(arr.length - 1, Math.floor(i * step));
    out.push(arr[idx]);
  }
  // Always include last
  if (out[out.length - 1] !== arr[arr.length - 1]) {
    out[out.length - 1] = arr[arr.length - 1];
  }
  return { items: out, sampled: true };
}

const APPENDIX_ROW_CAP = 60;
const CHART_POINT_CAP = 180;

// ---------- Section builders ----------

function buildPreamble(opts: ReportOptions): string {
  return `\\documentclass[11pt]{article}
\\usepackage[margin=1in]{geometry}
\\usepackage{booktabs}
\\usepackage{longtable}
\\usepackage{array}
\\usepackage{tikz}
\\usepackage{pgfplots}
\\pgfplotsset{compat=1.18}
\\usepgfplotslibrary{dateplot}
\\usetikzlibrary{patterns}
\\usepackage{xcolor}
\\usepackage[most]{tcolorbox}
\\usepackage{hyperref}
\\hypersetup{colorlinks=false, pdfborder={0 0 0}}
\\setlength{\\parskip}{0.6em}
\\setlength{\\parindent}{0pt}
\\definecolor{callout}{HTML}{F5F5F5}
\\definecolor{calloutrule}{HTML}{B0B0B0}
\\title{${latexEscape(opts.title)}}
\\author{${latexEscape(opts.author)} \\\\ ${latexEscape(opts.institution)}}
\\date{\\today}

\\newtcolorbox{callout}{
  colback=callout,
  colframe=calloutrule,
  boxrule=0.4pt,
  arc=2pt,
  left=10pt, right=10pt, top=8pt, bottom=8pt,
}

\\begin{document}
\\maketitle
`;
}

function buildDataCollection(bundle: ReportBundle, opts: ReportOptions, prose: ReportProse): string {
  const rows = bundle.deployments
    .map((d) => {
      const name = latexEscape(d.name);
      const dev = latexEscape(d.device_id);
      const loc = latexEscape(d.location || '');
      const zip = latexEscape(d.zip_code || '');
      const locZip = zip ? `${loc} (${zip})` : loc;
      const start = fmtDateTime(d.started_at);
      const end = d.ended_at ? fmtDateTime(d.ended_at) : 'Ongoing';
      const count = d.reading_count.toLocaleString();
      return `${name} & ${dev} & ${latexEscape(locZip)} & ${start} & ${end} & ${count} \\\\`;
    })
    .join('\n');

  const table = `\\begin{table}[h]
\\centering
\\small
\\begin{tabular}{@{}l l l l l r@{}}
\\toprule
Deployment & Device & Location & Start & End & Readings \\\\
\\midrule
${rows}
\\bottomrule
\\end{tabular}
\\end{table}`;

  const gapsBlock =
    opts.include_gaps_note && bundle.gaps.length > 0
      ? `\n\\textbf{Data gaps (>3h) detected within deployment windows:}
\\begin{itemize}
${bundle.gaps
  .map(
    (g) =>
      `  \\item ${fmtDateTime(g.start)} to ${fmtDateTime(g.end)} (${fmt(g.hours, 1)} hours)`,
  )
  .join('\n')}
\\end{itemize}
`
      : '';

  const totalReadings = bundle.deployments.reduce((s, d) => s + d.reading_count, 0);
  const daysNum = Math.max(0, Math.round(bundle.window.days));
  const fallback = `${bundle.deployments.length} deployment${
    bundle.deployments.length === 1 ? '' : 's'
  } covered ${daysNum} day${daysNum === 1 ? '' : 's'} with ${totalReadings.toLocaleString()} sensor readings across ${bundle.device_count} device${
    bundle.device_count === 1 ? '' : 's'
  }.${
    bundle.gaps.length > 0
      ? ` ${bundle.gaps.length} gap${bundle.gaps.length === 1 ? '' : 's'} totaling ${fmt(
          bundle.gaps.reduce((s, g) => s + g.hours, 0),
          1,
        )} hours were detected inside active deployment windows.`
      : ''
  }`;

  const narrative = prose.coverage_narrative ?? fallback;

  return `\\section*{Data Collection}
${table}
${gapsBlock}
${narrative}
`;
}

function buildStatisticalSummary(bundle: ReportBundle, prose: ReportProse): string {
  const s = bundle.overall_stats;

  const callout = `\\begin{callout}
\\textbf{Temperature:} mean ${fmt(s.temp_avg, 2, '°F')}, median ${fmt(s.temp_median, 2, '°F')}, range ${fmt(s.temp_min, 2)}--${fmt(s.temp_max, 2, '°F')}, $\\sigma = ${fmt(s.temp_stddev, 2)}$ \\\\
\\textbf{Humidity:} mean ${fmt(s.humidity_avg, 2, '\\%')}, median ${fmt(s.humidity_median, 2, '\\%')}, range ${fmt(s.humidity_min, 2)}--${fmt(s.humidity_max, 2, '\\%')}, $\\sigma = ${fmt(s.humidity_stddev, 2)}$ \\\\
\\textbf{Correlation (Pearson r):} ${bundle.pearson_temp_humidity !== null ? fmt(bundle.pearson_temp_humidity, 3) : 'n/a'} \\\\
\\textbf{Readings:} ${s.n.toLocaleString()}
\\end{callout}`;

  const fallback = `Temperature averaged ${fmt(s.temp_avg, 2, '°F')} with a standard deviation of ${fmt(s.temp_stddev, 2, '°F')} across a ${fmt((s.temp_max ?? 0) - (s.temp_min ?? 0), 1, '°F')} range. Humidity averaged ${fmt(s.humidity_avg, 2, '\\%')} with a standard deviation of ${fmt(s.humidity_stddev, 2, '\\%')}.${
    bundle.pearson_temp_humidity !== null
      ? ` Temperature and humidity had a Pearson correlation of ${fmt(bundle.pearson_temp_humidity, 3)}.`
      : ''
  }`;

  const narrative = prose.statistical_summary ?? fallback;

  let outlierBlock = '';
  if (bundle.outliers.length > 0) {
    const items = bundle.outliers
      .map((o) => {
        const value =
          o.metric === 'temperature' ? `${fmt(o.value, 2, '°F')}` : `${fmt(o.value, 1, '\\%')}`;
        return `  \\item ${fmtDate(o.day)}: ${o.metric} ${o.bound === 'above' ? 'above' : 'below'} IQR bound (${value})`;
      })
      .join('\n');

    const outlierFallback = `${bundle.outliers.length} outlier${
      bundle.outliers.length === 1 ? '' : 's'
    } detected via IQR on daily averages.`;

    outlierBlock = `\n\\subsection*{Outliers}
\\begin{itemize}
${items}
\\end{itemize}
${prose.outlier_narrative ?? outlierFallback}
`;
  }

  return `\\section*{Statistical Summary}
${callout}

${narrative}
${outlierBlock}`;
}

function buildDiurnalChart(bundle: ReportBundle): string {
  if (bundle.hourly_averages.length === 0) return '';

  const tempCoords = bundle.hourly_averages
    .filter((h) => h.temp_avg !== null)
    .map((h) => `(${h.hour}, ${(h.temp_avg as number).toFixed(2)})`)
    .join(' ');
  const humCoords = bundle.hourly_averages
    .filter((h) => h.humidity_avg !== null)
    .map((h) => `(${h.hour}, ${(h.humidity_avg as number).toFixed(2)})`)
    .join(' ');

  return `\\begin{center}
\\begin{tikzpicture}
\\begin{axis}[
  width=0.9\\textwidth, height=7cm,
  xlabel={Hour of Day (Arizona time)},
  xmin=0, xmax=23,
  xtick={0,3,6,9,12,15,18,21},
  xticklabels={12a,3a,6a,9a,12p,3p,6p,9p},
  axis y line*=left,
  ylabel={Temperature (°F)},
  ymajorgrids=true,
  legend style={at={(0.02,0.98)}, anchor=north west, font=\\small},
]
\\addplot[color=black, mark=*, mark size=1.2pt, thick] coordinates {${tempCoords}};
\\addlegendentry{Temperature}
\\end{axis}
\\begin{axis}[
  width=0.9\\textwidth, height=7cm,
  xmin=0, xmax=23,
  axis y line*=right,
  axis x line=none,
  ylabel={Humidity (\\%)},
  legend style={at={(0.98,0.98)}, anchor=north east, font=\\small},
]
\\addplot[color=gray, mark=triangle, mark size=1.5pt, dashed] coordinates {${humCoords}};
\\addlegendentry{Humidity}
\\end{axis}
\\end{tikzpicture}
\\end{center}
`;
}

function buildDiurnal(bundle: ReportBundle, prose: ReportProse): string {
  if (bundle.hourly_averages.length === 0) return '';

  const chart = buildDiurnalChart(bundle);

  const tempPoints = bundle.hourly_averages.filter((h) => h.temp_avg !== null);
  let tempMax = tempPoints[0];
  let tempMin = tempPoints[0];
  for (const p of tempPoints) {
    if ((p.temp_avg as number) > (tempMax.temp_avg as number)) tempMax = p;
    if ((p.temp_avg as number) < (tempMin.temp_avg as number)) tempMin = p;
  }
  const humPoints = bundle.hourly_averages.filter((h) => h.humidity_avg !== null);
  let humMax = humPoints[0];
  let humMin = humPoints[0];
  for (const p of humPoints) {
    if ((p.humidity_avg as number) > (humMax.humidity_avg as number)) humMax = p;
    if ((p.humidity_avg as number) < (humMin.humidity_avg as number)) humMin = p;
  }

  let fallback = '';
  if (tempMin && tempMax) {
    const swing =
      (tempMax.temp_avg as number) - (tempMin.temp_avg as number);
    fallback = `Hourly averages bottomed at ${fmt(tempMin.temp_avg, 1, '°F')} at ${fmtHour(tempMin.hour)} and peaked at ${fmt(tempMax.temp_avg, 1, '°F')} at ${fmtHour(tempMax.hour)}, a diurnal swing of ${fmt(swing, 1, '°F')}.`;
    if (humMin && humMax) {
      fallback += ` Humidity peaked at ${fmt(humMax.humidity_avg, 1, '\\%')} at ${fmtHour(humMax.hour)} and bottomed at ${fmt(humMin.humidity_avg, 1, '\\%')} at ${fmtHour(humMin.hour)}.`;
    }
  }

  const narrative = prose.diurnal_narrative ?? fallback;

  return `\\section*{Diurnal Patterns}
${chart}
${narrative}
`;
}

function buildAccuracy(bundle: ReportBundle, opts: ReportOptions, prose: ReportProse): string {
  if (!opts.include_weather_section || !bundle.has_weather_data) return '';
  if (bundle.daily_comparison.length === 0) return '';

  const valid = bundle.daily_comparison.filter(
    (d) => d.temp_error_pct !== null || d.humidity_error_pct !== null,
  );
  if (valid.length === 0) return '';

  const tempErrors = valid
    .filter((d) => d.temp_error_pct !== null)
    .map((d) => ({ day: d.day, err: d.temp_error_pct as number }));
  const humErrors = valid
    .filter((d) => d.humidity_error_pct !== null)
    .map((d) => ({ day: d.day, err: d.humidity_error_pct as number }));

  const avgTempErr =
    tempErrors.length > 0
      ? tempErrors.reduce((s, d) => s + d.err, 0) / tempErrors.length
      : null;
  const avgHumErr =
    humErrors.length > 0
      ? humErrors.reduce((s, d) => s + d.err, 0) / humErrors.length
      : null;

  const maxTempErr =
    tempErrors.length > 0
      ? tempErrors.reduce((a, b) => (Math.abs(b.err) > Math.abs(a.err) ? b : a))
      : null;
  const maxHumErr =
    humErrors.length > 0
      ? humErrors.reduce((a, b) => (Math.abs(b.err) > Math.abs(a.err) ? b : a))
      : null;

  const callout = `\\begin{callout}
\\textbf{Temperature error:} average ${fmtSigned(avgTempErr, 1, '\\%')}${
    maxTempErr
      ? `, peak ${fmtSigned(maxTempErr.err, 1, '\\%')} on ${fmtDate(maxTempErr.day)}`
      : ''
  } \\\\
\\textbf{Humidity error:} average ${fmtSigned(avgHumErr, 1, '\\%')}${
    maxHumErr
      ? `, peak ${fmtSigned(maxHumErr.err, 1, '\\%')} on ${fmtDate(maxHumErr.day)}`
      : ''
  }
\\end{callout}`;

  // Daily comparison charts (temp and humidity)
  const sampledComp = sampleEvenly(bundle.daily_comparison, CHART_POINT_CAP).items;

  const sensorTempCoords = sampledComp
    .filter((d) => d.sensor_temp !== null)
    .map((d) => `(${pgfplotsDateCoord(d.day)}, ${(d.sensor_temp as number).toFixed(2)})`)
    .join(' ');
  const weatherTempCoords = sampledComp
    .filter((d) => d.weather_temp !== null)
    .map((d) => `(${pgfplotsDateCoord(d.day)}, ${(d.weather_temp as number).toFixed(2)})`)
    .join(' ');

  const tempChart = `\\begin{center}
\\begin{tikzpicture}
\\begin{axis}[
  width=0.9\\textwidth, height=6.5cm,
  date coordinates in=x,
  xticklabel={\\month/\\day},
  xticklabel style={rotate=45, anchor=north east, font=\\tiny},
  xlabel={Date}, ylabel={Temperature (°F)},
  ymajorgrids=true,
  legend style={at={(0.02,0.98)}, anchor=north west, font=\\small},
]
\\addplot[color=black, mark=*, mark size=1.2pt, thick] coordinates {${sensorTempCoords}};
\\addlegendentry{Sensor}
\\addplot[color=gray, mark=square, mark size=1.2pt, dashed] coordinates {${weatherTempCoords}};
\\addlegendentry{Weather reference}
\\end{axis}
\\end{tikzpicture}
\\end{center}`;

  const sensorHumCoords = sampledComp
    .filter((d) => d.sensor_humidity !== null)
    .map((d) => `(${pgfplotsDateCoord(d.day)}, ${(d.sensor_humidity as number).toFixed(2)})`)
    .join(' ');
  const weatherHumCoords = sampledComp
    .filter((d) => d.weather_humidity !== null)
    .map((d) => `(${pgfplotsDateCoord(d.day)}, ${(d.weather_humidity as number).toFixed(2)})`)
    .join(' ');

  const humChart = `\\begin{center}
\\begin{tikzpicture}
\\begin{axis}[
  width=0.9\\textwidth, height=6.5cm,
  date coordinates in=x,
  xticklabel={\\month/\\day},
  xticklabel style={rotate=45, anchor=north east, font=\\tiny},
  xlabel={Date}, ylabel={Humidity (\\%)},
  ymajorgrids=true,
  legend style={at={(0.02,0.98)}, anchor=north west, font=\\small},
]
\\addplot[color=black, mark=*, mark size=1.2pt, thick] coordinates {${sensorHumCoords}};
\\addlegendentry{Sensor}
\\addplot[color=gray, mark=square, mark size=1.2pt, dashed] coordinates {${weatherHumCoords}};
\\addlegendentry{Weather reference}
\\end{axis}
\\end{tikzpicture}
\\end{center}`;

  const accuracyFallback = `The sensor averaged ${fmtSigned(avgTempErr, 1, '\\%')} temperature error and ${fmtSigned(avgHumErr, 1, '\\%')} humidity error relative to the reference weather station.${
    maxTempErr
      ? ` Peak temperature error was ${fmtSigned(maxTempErr.err, 1, '\\%')} on ${fmtDate(maxTempErr.day)}.`
      : ''
  }${
    maxHumErr
      ? ` Peak humidity error was ${fmtSigned(maxHumErr.err, 1, '\\%')} on ${fmtDate(maxHumErr.day)}.`
      : ''
  }`;

  const accuracyNarrative = prose.accuracy_narrative ?? accuracyFallback;

  let errorTrendBlock = '';
  if (bundle.daily_comparison.length >= 5) {
    const tempErrCoords = tempErrors
      .map((d) => `(${pgfplotsDateCoord(d.day)}, ${d.err.toFixed(2)})`)
      .join(' ');
    const humErrCoords = humErrors
      .map((d) => `(${pgfplotsDateCoord(d.day)}, ${d.err.toFixed(2)})`)
      .join(' ');

    const trendChart = `\\begin{center}
\\begin{tikzpicture}
\\begin{axis}[
  width=0.9\\textwidth, height=6.5cm,
  date coordinates in=x,
  xticklabel={\\month/\\day},
  xticklabel style={rotate=45, anchor=north east, font=\\tiny},
  xlabel={Date}, ylabel={Error (\\%)},
  ymajorgrids=true,
  legend style={at={(0.02,0.98)}, anchor=north west, font=\\small},
]
\\addplot[color=black, mark=*, mark size=1.2pt, thick] coordinates {${tempErrCoords}};
\\addlegendentry{Temperature error}
\\addplot[color=gray, mark=triangle, mark size=1.5pt, dashed] coordinates {${humErrCoords}};
\\addlegendentry{Humidity error}
\\addplot[domain=${tempErrors.length > 0 ? pgfplotsDateCoord(tempErrors[0].day) : ''}:${tempErrors.length > 0 ? pgfplotsDateCoord(tempErrors[tempErrors.length - 1].day) : ''}, samples=2, color=gray!60] {0};
\\end{axis}
\\end{tikzpicture}
\\end{center}`;

    // Simple linear slope for fallback narrative
    const slopeSign = (pts: Array<{ day: string; err: number }>): string => {
      if (pts.length < 2) return 'stable';
      const first = pts[0].err;
      const last = pts[pts.length - 1].err;
      const diff = last - first;
      if (Math.abs(diff) < 1) return 'stable';
      return diff > 0 ? 'upward' : 'downward';
    };

    const trendFallback = `Temperature error trended ${slopeSign(tempErrors)} over the window; humidity error trended ${slopeSign(humErrors)}.`;
    const trendNarrative = prose.error_trend_narrative ?? trendFallback;

    errorTrendBlock = `\n\\subsection*{Error Trend}
${trendChart}
${trendNarrative}
`;
  }

  return `\\section*{Sensor Accuracy}
${callout}

${tempChart}

${humChart}

${accuracyNarrative}
${errorTrendBlock}`;
}

function buildKeyFindings(bundle: ReportBundle, opts: ReportOptions, prose: ReportProse): string {
  let bullets: string[] = [];

  if (prose.key_findings.length > 0) {
    bullets = prose.key_findings;
  } else {
    const s = bundle.overall_stats;
    const daysNum = Math.max(0, Math.round(bundle.window.days));
    bullets.push(
      `Collection window: ${daysNum} day${daysNum === 1 ? '' : 's'}, ${s.n.toLocaleString()} sensor readings across ${bundle.device_count} device${bundle.device_count === 1 ? '' : 's'}.`,
    );
    bullets.push(
      `Temperature averaged ${fmt(s.temp_avg, 2, '°F')} (range ${fmt(s.temp_min, 2)}--${fmt(s.temp_max, 2, '°F')}, $\\sigma = ${fmt(s.temp_stddev, 2)}$).`,
    );
    bullets.push(
      `Humidity averaged ${fmt(s.humidity_avg, 2, '\\%')} (range ${fmt(s.humidity_min, 2)}--${fmt(s.humidity_max, 2, '\\%')}, $\\sigma = ${fmt(s.humidity_stddev, 2)}$).`,
    );
    if (bundle.pearson_temp_humidity !== null) {
      const r = bundle.pearson_temp_humidity;
      const strength =
        Math.abs(r) >= 0.7 ? 'strong' : Math.abs(r) >= 0.4 ? 'moderate' : 'weak';
      const direction = r >= 0 ? 'positive' : 'inverse';
      bullets.push(
        `Temperature and humidity showed a ${strength} ${direction} correlation (r = ${fmt(r, 3)}).`,
      );
    }
    if (bundle.hourly_averages.length > 0) {
      const temps = bundle.hourly_averages
        .map((h) => h.temp_avg)
        .filter((v): v is number => v !== null);
      if (temps.length > 0) {
        const swing = Math.max(...temps) - Math.min(...temps);
        bullets.push(`Diurnal temperature swing: ${fmt(swing, 1, '°F')}.`);
      }
    }
    if (bundle.outliers.length > 0) {
      bullets.push(
        `${bundle.outliers.length} outlier${bundle.outliers.length === 1 ? '' : 's'} flagged by IQR on daily averages.`,
      );
    }
    if (opts.include_weather_section && bundle.has_weather_data) {
      const tempErrs = bundle.daily_comparison
        .map((d) => d.temp_error_pct)
        .filter((v): v is number => v !== null);
      if (tempErrs.length > 0) {
        const avg = tempErrs.reduce((s, v) => s + v, 0) / tempErrs.length;
        bullets.push(
          `Sensor temperature averaged ${fmtSigned(avg, 1, '\\%')} relative to the reference weather station over ${tempErrs.length} day${tempErrs.length === 1 ? '' : 's'}.`,
        );
      }
    }
  }

  if (bullets.length === 0) return '';

  return `\\section*{Key Findings}
\\begin{itemize}
${bullets.map((b) => `  \\item ${b.startsWith('\\') ? b : latexEscape(b)}`).join('\n')}
\\end{itemize}
`;
}

function buildAppendixHourly(bundle: ReportBundle): string {
  if (bundle.hourly_averages.length === 0) return '';

  const rows = bundle.hourly_averages
    .map(
      (h) =>
        `${fmtHour(h.hour)} & ${fmt(h.temp_avg, 1)} & ${fmt(h.humidity_avg, 1)} & ${h.n.toLocaleString()} \\\\`,
    )
    .join('\n');

  return `\\section*{Appendix A: Hourly Averages}
Average temperature and humidity by hour of day (Arizona time).

\\begin{center}
\\begin{tabular}{@{}l r r r@{}}
\\toprule
Hour & Temp (°F) & Humidity (\\%) & Readings \\\\
\\midrule
${rows}
\\bottomrule
\\end{tabular}
\\end{center}
`;
}

function buildAppendixDailyTemp(bundle: ReportBundle, opts: ReportOptions): string {
  if (!opts.include_weather_section || !bundle.has_weather_data) return '';
  const withTemp = bundle.daily_comparison.filter((d) => d.sensor_temp !== null);
  if (withTemp.length === 0) return '';

  const { items, sampled } = sampleEvenly(withTemp, APPENDIX_ROW_CAP);
  const rows = items
    .map((d) => {
      const err =
        d.temp_error_pct !== null ? fmtSigned(d.temp_error_pct, 1, '\\%') : 'n/a';
      return `${fmtShortDate(d.day)} & ${fmt(d.sensor_temp, 1)} & ${fmt(d.weather_temp, 1)} & ${err} \\\\`;
    })
    .join('\n');

  const note = sampled
    ? `\n\\emph{(Sampled evenly; ${withTemp.length} rows total.)}`
    : '';

  return `\\section*{Appendix B: Daily Temperature Comparison}
Percent error calculated as ((Sensor $-$ Weather) / Weather) $\\times$ 100.

\\begin{center}
\\begin{tabular}{@{}l r r r@{}}
\\toprule
Date & Sensor (°F) & Weather (°F) & Error \\\\
\\midrule
${rows}
\\bottomrule
\\end{tabular}${note}
\\end{center}
`;
}

function buildAppendixDailyHumidity(bundle: ReportBundle, opts: ReportOptions): string {
  if (!opts.include_weather_section || !bundle.has_weather_data) return '';
  const withHum = bundle.daily_comparison.filter((d) => d.sensor_humidity !== null);
  if (withHum.length === 0) return '';

  const { items, sampled } = sampleEvenly(withHum, APPENDIX_ROW_CAP);
  const rows = items
    .map((d) => {
      const err =
        d.humidity_error_pct !== null ? fmtSigned(d.humidity_error_pct, 1, '\\%') : 'n/a';
      return `${fmtShortDate(d.day)} & ${fmt(d.sensor_humidity, 1, '\\%')} & ${fmt(d.weather_humidity, 1, '\\%')} & ${err} \\\\`;
    })
    .join('\n');

  const note = sampled
    ? `\n\\emph{(Sampled evenly; ${withHum.length} rows total.)}`
    : '';

  return `\\section*{Appendix C: Daily Humidity Comparison}
\\begin{center}
\\begin{tabular}{@{}l r r r@{}}
\\toprule
Date & Sensor & Weather & Error \\\\
\\midrule
${rows}
\\bottomrule
\\end{tabular}${note}
\\end{center}
`;
}

// ---------- Main entry point ----------

export function buildTexSource(
  bundle: ReportBundle,
  opts: ReportOptions,
  prose: ReportProse | null,
): string {
  const safeProse: ReportProse = prose ?? {
    coverage_narrative: null,
    statistical_summary: null,
    diurnal_narrative: null,
    accuracy_narrative: null,
    error_trend_narrative: null,
    outlier_narrative: null,
    key_findings: [],
  };

  const parts: string[] = [];
  parts.push(buildPreamble(opts));
  parts.push(buildDataCollection(bundle, opts, safeProse));
  parts.push(buildStatisticalSummary(bundle, safeProse));
  parts.push(buildDiurnal(bundle, safeProse));
  parts.push(buildAccuracy(bundle, opts, safeProse));
  parts.push(buildKeyFindings(bundle, opts, safeProse));
  parts.push(buildAppendixHourly(bundle));
  parts.push(buildAppendixDailyTemp(bundle, opts));
  parts.push(buildAppendixDailyHumidity(bundle, opts));
  parts.push('\\end{document}\n');

  return parts.filter((p) => p.length > 0).join('\n');
}
