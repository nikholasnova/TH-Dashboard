import { GoogleGenerativeAI } from '@google/generative-ai';
import { getServerUser, enforceOrigin } from '@/lib/serverAuth';
import { getServerClient } from '@/lib/supabase/server';
import { nlFilterLimiter } from '@/lib/rateLimiter';
import type { NLFilterResponse } from '@/components/DataExplorer/filterTypes';

export const maxDuration = 20;

function buildSystemPrompt(devices: { id: string; display_name: string }[]): string {
  const deviceList = devices.map((d) => `${d.id} (${d.display_name})`).join(', ');
  const now = new Date().toISOString();
  return `You translate natural-language queries about IoT sensor readings into a strict JSON filter object.

REGISTERED DEVICES: ${deviceList || '(none)'}. Device IDs like "node1", "node2" (no spaces — "node 1" means "node1").

CURRENT TIME (UTC): ${now}.

Return ONLY a JSON object (no prose, no code fences) with any subset of these keys:
- deviceIds: string[] — sensor device ids only (never "weather_*" prefixes).
- rangePreset: "1h" | "24h" | "7d" | "30d" | "all" | "custom". Rules:
    * "1h" — user says "last hour", "right now", "latest"
    * "24h" — user says "today", "last day", "last 24 hours"
    * "7d" — user says "this week", "past week", "last 7 days"
    * "30d" — user says "this month", "past month", "last 30 days"
    * "custom" — user names specific dates or windows like "30 to 40 days ago", "March 14", "between X and Y"
    * "all" — DEFAULT when NO timeframe is mentioned, AND whenever the user is looking for anomalies/spikes/outliers/bad readings/weird values without a time window. These can happen anywhere in history, so a narrow default would hide them.
- customStart, customEnd: ISO 8601 UTC strings (required only when rangePreset is "custom").
- minTempF, maxTempF: numbers in FAHRENHEIT. "hot" roughly >= 85F, "cold" roughly <= 60F, "warm" >= 75F.
- minHumidity, maxHumidity: percent numbers 0-100. "humid" >= 60, "dry" <= 30.
- source: "sensor" | "weather" | "both". Default "sensor". Use "weather" only if the user explicitly asks about weather/OpenWeather.
- anomaliesOnly: boolean. Set true if the user mentions "weird", "spike", "anomaly", "outlier", "bad reading".

OMIT keys the user did not imply. Do not invent values.

EXAMPLES:
"hot readings from yesterday on node2" -> {"deviceIds":["node2"],"rangePreset":"24h","minTempF":85}
"coldest readings last week" -> {"rangePreset":"7d","maxTempF":60}
"find anomalies on node1" -> {"deviceIds":["node1"],"rangePreset":"all","anomaliesOnly":true}
"any weird readings" -> {"rangePreset":"all","anomaliesOnly":true}
"spike on node2" -> {"deviceIds":["node2"],"rangePreset":"all","anomaliesOnly":true}
"humid afternoons" -> {"minHumidity":60}
"readings above 200F" -> {"rangePreset":"all","minTempF":200}`;
}

function parseJson(text: string): NLFilterResponse {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  const match = trimmed.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in response');
  return JSON.parse(match[0]);
}

export async function POST(req: Request) {
  const originErr = enforceOrigin(req);
  if (originErr) return originErr;

  const user = await getServerUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { success } = await nlFilterLimiter.limit(user.id);
  if (!success) {
    return Response.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    return Response.json({ error: 'NL search is not configured' }, { status: 501 });
  }

  let body: { query?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const query = typeof body.query === 'string' ? body.query.slice(0, 500).trim() : '';
  if (!query) {
    return Response.json({ error: 'Query is required' }, { status: 400 });
  }

  let devices: { id: string; display_name: string }[] = [];
  try {
    const client = getServerClient();
    const { data } = await client
      .from('devices')
      .select('id, display_name')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });
    devices = data ?? [];
  } catch {
    // fall through with empty list
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: buildSystemPrompt(devices),
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    });
    const result = await model.generateContent(query);
    const text = result.response.text();
    const parsed = parseJson(text);
    return Response.json({ filter: parsed });
  } catch (e) {
    console.error('NL filter error:', e);
    return Response.json({ error: 'Could not parse query' }, { status: 500 });
  }
}
