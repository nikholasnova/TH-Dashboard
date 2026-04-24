import { GoogleGenerativeAI, SchemaType } from '@google/generative-ai';
import type { ReportBundle } from './supabase/types';
import type { ReportOptions, ReportProse } from './reportTemplate';
import { latexEscape } from './reportTemplate';

const SYSTEM_PROMPT = `You are a data-analysis ghostwriter producing the analytical prose for a student's IoT temperature and humidity monitoring report. You are given pre-computed numerical summaries and must return structured JSON with one paragraph (or bullet list) per section.

STRICT RULES — violating any of these invalidates the output:

1. Every claim must be directly grounded in a number from the provided bundle. Do not invent statistics. Do not round away from the provided precision.

2. ABSOLUTELY FORBIDDEN — causal or contextual speculation:
   - No "because", "due to", "caused by", "suggests", "likely", "probably", "appears to be", "indicative of", "explained by", "attributable to".
   - No references to placement, enclosure, building, patio, wall, teammates, colleagues, hardware model (DHT20, Arduino, WiFi), sensor brand, project status, sensor failure, sensor degradation, or sensor drift as a causal claim.
   - No references to weather events, seasons, time of year, or geographic context beyond what is stated in the bundle.

3. ABSOLUTELY FORBIDDEN — forward-looking or incompleteness language:
   - No "future work", "next steps", "would benefit", "further investigation", "limitations of this analysis", "additional data needed", "more readings required", "worth investigating", "recommend", "should explore".
   - The prose must read as complete on its own. No "this report does not cover X" or similar.

4. FORBIDDEN — editorializing adjectives: "impressive", "surprisingly", "interesting", "remarkable", "notable", "significantly" (when not a statistical term).

5. Voice: plain, confident, past tense, declarative. Like an engineering student reporting their measurements to a professor. No hedging fluff.

6. Output structure:
   - coverage_narrative: 1-3 sentences about deployment count, readings total, days covered, gap count if any. Factual.
   - statistical_summary: 1-2 paragraphs tying mean/median/range/stddev and Pearson r into readable prose.
   - diurnal_narrative: 1-2 paragraphs describing the shape of the daily cycle — morning low time and value, afternoon peak time and value, diurnal swing in degrees, humidity inverse relationship if correlation is negative.
   - accuracy_narrative: 1-2 paragraphs on sign and magnitude of sensor error vs reference, for both temperature and humidity. Null if no weather data provided.
   - error_trend_narrative: 1-2 sentences on whether sensor error trended up, down, or stayed stable over the window. Null if fewer than 5 daily comparison points.
   - outlier_narrative: 1-2 sentences identifying the flagged outliers by date and metric. Null if no outliers.
   - key_findings: 5 to 8 bullet strings, each a self-contained data-grounded conclusion. No recommendations, no next steps.

7. For any field where the input data is insufficient, emit null (or empty array for key_findings) instead of padding with filler.

Return ONLY the JSON object matching the provided schema. No preamble, no markdown fences.`;

const FEW_SHOT_EXAMPLAR = `Example tone (not the data you are given — this is just voice reference):

"The sensor collected 9,573 readings over 22 days across two deployment windows at a single location. Temperature averaged 65.95°F with a standard deviation of 9.56°F across a 56°F range, while humidity averaged 34.16% with a 13.50 percentage-point standard deviation. Temperature and humidity were strongly inversely correlated (r = -0.89)."

"Hourly averages showed temperatures bottoming at 56.6°F around 6 AM and peaking at 84.0°F at 3 PM, a diurnal swing of 27.4°F. Humidity mirrored the cycle, peaking at 41.0% in the early morning and dropping to 18.7% in the afternoon."

"The sensor averaged +5.7% error on temperature and -13.5% error on humidity relative to the reference station. The largest single-day deviation was +11.9% on Feb 21."`;

function round(n: number | null | undefined, digits: number): number | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const factor = Math.pow(10, digits);
  return Math.round(n * factor) / factor;
}

function roundStats(s: {
  temp_avg: number | null;
  temp_median: number | null;
  temp_min: number | null;
  temp_max: number | null;
  temp_stddev: number | null;
  humidity_avg: number | null;
  humidity_median: number | null;
  humidity_min: number | null;
  humidity_max: number | null;
  humidity_stddev: number | null;
  n: number;
}) {
  return {
    temp_avg: round(s.temp_avg, 1),
    temp_median: round(s.temp_median, 1),
    temp_min: round(s.temp_min, 1),
    temp_max: round(s.temp_max, 1),
    temp_stddev: round(s.temp_stddev, 2),
    humidity_avg: round(s.humidity_avg, 1),
    humidity_median: round(s.humidity_median, 1),
    humidity_min: round(s.humidity_min, 1),
    humidity_max: round(s.humidity_max, 1),
    humidity_stddev: round(s.humidity_stddev, 2),
    n: s.n,
  };
}

function buildCompactBundle(bundle: ReportBundle): Record<string, unknown> {
  const tempsHourly = bundle.hourly_averages
    .filter((h) => h.temp_avg !== null)
    .map((h) => ({ hour: h.hour, value: h.temp_avg as number }));
  const humHourly = bundle.hourly_averages
    .filter((h) => h.humidity_avg !== null)
    .map((h) => ({ hour: h.hour, value: h.humidity_avg as number }));

  const hourlyTempMin = tempsHourly.length > 0
    ? tempsHourly.reduce((a, b) => (b.value < a.value ? b : a))
    : null;
  const hourlyTempMax = tempsHourly.length > 0
    ? tempsHourly.reduce((a, b) => (b.value > a.value ? b : a))
    : null;
  const hourlyHumMin = humHourly.length > 0
    ? humHourly.reduce((a, b) => (b.value < a.value ? b : a))
    : null;
  const hourlyHumMax = humHourly.length > 0
    ? humHourly.reduce((a, b) => (b.value > a.value ? b : a))
    : null;

  const tempErrs = bundle.daily_comparison
    .filter((d) => d.temp_error_pct !== null)
    .map((d) => ({ day: d.day, err: d.temp_error_pct as number }));
  const humErrs = bundle.daily_comparison
    .filter((d) => d.humidity_error_pct !== null)
    .map((d) => ({ day: d.day, err: d.humidity_error_pct as number }));

  const avgTempErr =
    tempErrs.length > 0 ? tempErrs.reduce((s, d) => s + d.err, 0) / tempErrs.length : null;
  const avgHumErr =
    humErrs.length > 0 ? humErrs.reduce((s, d) => s + d.err, 0) / humErrs.length : null;
  const maxTempErr =
    tempErrs.length > 0
      ? tempErrs.reduce((a, b) => (Math.abs(b.err) > Math.abs(a.err) ? b : a))
      : null;
  const maxHumErr =
    humErrs.length > 0
      ? humErrs.reduce((a, b) => (Math.abs(b.err) > Math.abs(a.err) ? b : a))
      : null;

  const tempSlopeSign =
    tempErrs.length >= 2
      ? tempErrs[tempErrs.length - 1].err - tempErrs[0].err > 1
        ? 'upward'
        : tempErrs[tempErrs.length - 1].err - tempErrs[0].err < -1
          ? 'downward'
          : 'stable'
      : null;
  const humSlopeSign =
    humErrs.length >= 2
      ? humErrs[humErrs.length - 1].err - humErrs[0].err > 1
        ? 'upward'
        : humErrs[humErrs.length - 1].err - humErrs[0].err < -1
          ? 'downward'
          : 'stable'
      : null;

  const roundHourly = (p: { hour: number; value: number } | null) =>
    p ? { hour: p.hour, value: round(p.value, 1) } : null;
  const roundErr = (e: { day: string; err: number } | null) =>
    e ? { day: e.day, err: round(e.err, 1) } : null;

  return {
    window_days: Math.round(bundle.window.days),
    deployment_count: bundle.deployments.length,
    device_count: bundle.device_count,
    total_readings: bundle.overall_stats.n,
    has_weather_data: bundle.has_weather_data,
    gap_count: bundle.gaps.length,
    gap_total_hours: round(bundle.gaps.reduce((s, g) => s + g.hours, 0), 1),
    overall_stats: roundStats(bundle.overall_stats),
    pearson_temp_humidity: round(bundle.pearson_temp_humidity, 2),
    hourly_peak_temp: roundHourly(hourlyTempMax),
    hourly_trough_temp: roundHourly(hourlyTempMin),
    hourly_peak_humidity: roundHourly(hourlyHumMax),
    hourly_trough_humidity: roundHourly(hourlyHumMin),
    diurnal_temp_swing:
      hourlyTempMax && hourlyTempMin
        ? round(hourlyTempMax.value - hourlyTempMin.value, 1)
        : null,
    outliers: bundle.outliers.map((o) => ({
      day: o.day,
      metric: o.metric,
      value: round(o.value, o.metric === 'temperature' ? 1 : 1),
      bound: o.bound,
    })),
    daily_comparison_summary: {
      n: bundle.daily_comparison.length,
      avg_temp_error_pct: round(avgTempErr, 1),
      avg_humidity_error_pct: round(avgHumErr, 1),
      max_temp_error: roundErr(maxTempErr),
      max_humidity_error: roundErr(maxHumErr),
      temp_error_trend: tempSlopeSign,
      humidity_error_trend: humSlopeSign,
    },
  };
}

// Indicative forbidden-phrase list. Case-insensitive, word-boundary where applicable.
const FORBIDDEN_PATTERNS: RegExp[] = [
  // Causal
  /\bbecause\b/i,
  /\bdue to\b/i,
  /\bcaused by\b/i,
  /\bsuggests?\b/i,
  /\blikely\b/i,
  /\bprobably\b/i,
  /\bappears? to be\b/i,
  /\bindicative of\b/i,
  /\bexplained by\b/i,
  /\battributable to\b/i,
  // Forward-looking / incompleteness
  /\bfuture work\b/i,
  /\bnext steps?\b/i,
  /\bwould benefit\b/i,
  /\bfurther investigation\b/i,
  /\blimitations?\b/i,
  /\badditional data\b/i,
  /\bmore readings\b/i,
  /\bwould be interesting\b/i,
  /\brecommend/i,
  /\bshould explore\b/i,
  /\bworth investigating\b/i,
  // Hardware / placement leakage
  /\bDHT\d+/i,
  /\bsensor housing\b/i,
  /\bplacement\b/i,
  /\benclosure\b/i,
  /\bnear (?:the |a )?wall\b/i,
  /\bpatio\b/i,
  /\bbuilding\b/i,
  /\bteammate/i,
  /\bcolleague/i,
  /\bArduino\b/i,
  /\bWi-?Fi\b/i,
  /\b(?:sensor )?(?:degrad|drift|fail)ing\b/i,
  /\bsensor failure\b/i,
];

export function containsForbidden(text: string): boolean {
  if (!text) return false;
  return FORBIDDEN_PATTERNS.some((re) => re.test(text));
}

function filterString(s: string | null | undefined): string | null {
  if (!s || typeof s !== 'string') return null;
  const trimmed = s.trim();
  if (!trimmed) return null;
  if (containsForbidden(trimmed)) return null;
  return latexEscape(trimmed);
}

function filterBullets(bullets: unknown): string[] {
  if (!Array.isArray(bullets)) return [];
  return bullets
    .filter((b): b is string => typeof b === 'string' && b.trim().length > 0)
    .filter((b) => !containsForbidden(b))
    .slice(0, 8)
    .map((b) => latexEscape(b.trim()));
}

function emptyProse(): ReportProse {
  return {
    coverage_narrative: null,
    statistical_summary: null,
    diurnal_narrative: null,
    accuracy_narrative: null,
    error_trend_narrative: null,
    outlier_narrative: null,
    key_findings: [],
  };
}

export async function generateReportProse(
  bundle: ReportBundle,
  _opts: ReportOptions,
  timeoutMs = 15000,
): Promise<ReportProse> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.warn('GOOGLE_API_KEY missing — skipping prose generation');
    return emptyProse();
  }

  const genAI = new GoogleGenerativeAI(apiKey);

  const schemaProperties = {
    coverage_narrative: { type: SchemaType.STRING, nullable: true },
    statistical_summary: { type: SchemaType.STRING, nullable: true },
    diurnal_narrative: { type: SchemaType.STRING, nullable: true },
    accuracy_narrative: { type: SchemaType.STRING, nullable: true },
    error_trend_narrative: { type: SchemaType.STRING, nullable: true },
    outlier_narrative: { type: SchemaType.STRING, nullable: true },
    key_findings: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
  } as const;

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_PROMPT + '\n\n' + FEW_SHOT_EXAMPLAR,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: schemaProperties,
      },
      temperature: 0.7,
    },
  });

  const compact = buildCompactBundle(bundle);
  const userMessage = `Here are the pre-computed summaries. Write the report prose as JSON.\n\n\`\`\`json\n${JSON.stringify(compact, null, 2)}\n\`\`\``;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: userMessage }] }],
    });

    clearTimeout(timer);
    const raw = result.response.text();
    if (!raw) return emptyProse();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      console.warn('Prose generator returned non-JSON output:', err);
      return emptyProse();
    }

    return {
      coverage_narrative: filterString(parsed.coverage_narrative as string),
      statistical_summary: filterString(parsed.statistical_summary as string),
      diurnal_narrative: filterString(parsed.diurnal_narrative as string),
      accuracy_narrative: filterString(parsed.accuracy_narrative as string),
      error_trend_narrative: filterString(parsed.error_trend_narrative as string),
      outlier_narrative: filterString(parsed.outlier_narrative as string),
      key_findings: filterBullets(parsed.key_findings),
    };
  } catch (err) {
    clearTimeout(timer);
    console.warn('Prose generation failed:', err);
    return emptyProse();
  }
}
