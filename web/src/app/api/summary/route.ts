import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import { getServerUser } from '@/lib/serverAuth';

// Use service role key to bypass RLS (auth is verified at request level)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

const RATE_LIMIT_MINUTES = 15; // Minimum minutes between summary requests

interface Reading {
  device_id: string;
  temperature: number;
  humidity: number;
  created_at: string;
}

interface Stats {
  avg: number;
  min: number;
  max: number;
  stdDev: number;
  count: number;
}

function calculateStats(values: number[]): Stats | null {
  if (values.length === 0) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  const stdDev = Math.sqrt(avgSquaredDiff);
  return {
    avg,
    min: Math.min(...values),
    max: Math.max(...values),
    stdDev,
    count: values.length,
  };
}

function celsiusToFahrenheit(c: number): number {
  return (c * 9) / 5 + 32;
}

export async function POST() {
  // Check authentication
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Check rate limit
  const windowStart = new Date(Date.now() - RATE_LIMIT_MINUTES * 60 * 1000);

  const { data: recentRequests } = await supabase
    .from('ai_requests')
    .select('requested_at')
    .gte('requested_at', windowStart.toISOString())
    .order('requested_at', { ascending: false })
    .limit(1);

  if (recentRequests && recentRequests.length > 0) {
    const lastRequest = new Date(recentRequests[0].requested_at);
    const minutesRemaining = Math.ceil(
      RATE_LIMIT_MINUTES -
        (Date.now() - lastRequest.getTime()) / (1000 * 60)
    );
    return NextResponse.json(
      {
        error: `Rate limited. Try again in ${minutesRemaining} minutes.`,
      },
      { status: 429 }
    );
  }

  // Check for API key
  if (!process.env.GOOGLE_API_KEY) {
    return NextResponse.json(
      { error: 'Gemini API key not configured' },
      { status: 500 }
    );
  }

  // Fetch last 24 hours of data
  const since = new Date();
  since.setHours(since.getHours() - 24);

  const { data: readings, error: fetchError } = await supabase
    .from('readings')
    .select('*')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: true });

  if (fetchError) {
    return NextResponse.json(
      { error: 'Failed to fetch readings' },
      { status: 500 }
    );
  }

  if (!readings || readings.length === 0) {
    return NextResponse.json(
      { error: 'No data available for analysis' },
      { status: 400 }
    );
  }

  // Calculate stats for each device
  const node1Readings = (readings as Reading[]).filter(
    (r) => r.device_id === 'node1'
  );
  const node2Readings = (readings as Reading[]).filter(
    (r) => r.device_id === 'node2'
  );

  const node1TempValues = node1Readings.map((r) => celsiusToFahrenheit(r.temperature));
  const node1HumidityValues = node1Readings.map((r) => r.humidity);
  const node2TempValues = node2Readings.map((r) => celsiusToFahrenheit(r.temperature));
  const node2HumidityValues = node2Readings.map((r) => r.humidity);

  const node1Temp = calculateStats(node1TempValues);
  const node1Humidity = calculateStats(node1HumidityValues);
  const node2Temp = calculateStats(node2TempValues);
  const node2Humidity = calculateStats(node2HumidityValues);

  const countOutliers = (values: number[], stats: Stats | null, sigma = 2) => {
    if (!stats || stats.count < 3) return 0;
    const threshold = stats.stdDev * sigma;
    return values.filter((v) => Math.abs(v - stats.avg) > threshold).length;
  };

  const getHourlyPeak = (deviceReadings: Reading[], metric: 'temperature' | 'humidity') => {
    const buckets = Array.from({ length: 24 }, () => ({ sum: 0, count: 0 }));
    const hourFormatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Phoenix' });
    for (const r of deviceReadings) {
      const hour = parseInt(hourFormatter.format(new Date(r.created_at)), 10);
      const value = metric === 'temperature'
        ? celsiusToFahrenheit(r.temperature)
        : r.humidity;
      buckets[hour].sum += value;
      buckets[hour].count += 1;
    }
    const averages = buckets.map((b) => (b.count ? b.sum / b.count : null));
    const maxIdx = averages.reduce(
      (best, val, idx) =>
        val !== null && (best.val === null || val > best.val) ? { idx, val } : best,
      { idx: -1, val: null as number | null }
    );
    return maxIdx.idx >= 0 ? `${maxIdx.idx}:00` : 'N/A';
  };

  const node1TempOutliers = countOutliers(node1TempValues, node1Temp);
  const node1HumOutliers = countOutliers(node1HumidityValues, node1Humidity);
  const node2TempOutliers = countOutliers(node2TempValues, node2Temp);
  const node2HumOutliers = countOutliers(node2HumidityValues, node2Humidity);

  const node1PeakTempHour = getHourlyPeak(node1Readings, 'temperature');
  const node1PeakHumHour = getHourlyPeak(node1Readings, 'humidity');
  const node2PeakTempHour = getHourlyPeak(node2Readings, 'temperature');
  const node2PeakHumHour = getHourlyPeak(node2Readings, 'humidity');

  const formatStat = (value: number | null | undefined, unit = '', digits = 1) =>
    value === null || value === undefined ? 'N/A' : `${value.toFixed(digits)}${unit}`;

  // Build prompt
  const prompt = `Analyze this 24-hour temperature and humidity data from two IoT sensors.

NODE 1 (${node1Temp?.count || 0} readings):
- Temperature: avg ${formatStat(node1Temp?.avg, '°F')}, min ${formatStat(node1Temp?.min, '°F')}, max ${formatStat(node1Temp?.max, '°F')}, std dev ${formatStat(node1Temp?.stdDev, '°F', 2)}
- Humidity: avg ${formatStat(node1Humidity?.avg, '%')}, min ${formatStat(node1Humidity?.min, '%')}, max ${formatStat(node1Humidity?.max, '%')}, std dev ${formatStat(node1Humidity?.stdDev, '%', 2)}
- Outliers: temp ${node1TempOutliers}, humidity ${node1HumOutliers}
- Peak hours (avg): temp ${node1PeakTempHour}, humidity ${node1PeakHumHour}

NODE 2 (${node2Temp?.count || 0} readings):
- Temperature: avg ${formatStat(node2Temp?.avg, '°F')}, min ${formatStat(node2Temp?.min, '°F')}, max ${formatStat(node2Temp?.max, '°F')}, std dev ${formatStat(node2Temp?.stdDev, '°F', 2)}
- Humidity: avg ${formatStat(node2Humidity?.avg, '%')}, min ${formatStat(node2Humidity?.min, '%')}, max ${formatStat(node2Humidity?.max, '%')}, std dev ${formatStat(node2Humidity?.stdDev, '%', 2)}
- Outliers: temp ${node2TempOutliers}, humidity ${node2HumOutliers}
- Peak hours (avg): temp ${node2PeakTempHour}, humidity ${node2PeakHumHour}

Write a concise 3–5 sentence summary that:
1. Compares the two nodes (temp + humidity)
2. Notes stability (std dev + outliers)
3. Mentions time-of-day patterns if visible
4. Flags anomalies or spikes
5. Mentions comfort ranges (68–76°F, 30–50% humidity) if relevant

Keep it short, plain, and practical.`;

  try {
    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const result = await model.generateContent(prompt);
    const response = result.response;
    const summary = response.text();

    // Record the request for rate limiting
    await supabase.from('ai_requests').insert({});

    return NextResponse.json({ summary });
  } catch (error) {
    console.error('Gemini API error:', error);
    return NextResponse.json(
      { error: 'Failed to generate summary' },
      { status: 500 }
    );
  }
}
