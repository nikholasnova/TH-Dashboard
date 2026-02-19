import { GoogleGenerativeAI, SchemaType, FunctionDeclaration } from '@google/generative-ai';
import { executeTool } from '@/lib/aiTools';
import { getServerUser } from '@/lib/serverAuth';
import { getServerClient } from '@/lib/supabase/server';

const SYSTEM_PROMPT = `You are an AI assistant for an IoT temperature and humidity monitoring system.
You help users understand their sensor data across different deployments and locations.

CAPABILITIES:
- Query deployment information (locations, time ranges, devices)
- Get statistics for deployments (temperature/humidity avg, min, max, stddev)
- Get overall device statistics across any time range (not limited to deployments)
- Retrieve raw readings for detailed analysis or to find the latest values
- Get time-bucketed trend data for identifying patterns over time
- Compare deployments across different locations, devices, or time periods

AVAILABLE TOOLS:
- get_deployments: List deployments with optional filters (device, location, zip_code, active status)
- get_deployment_stats: Get aggregate stats for specific deployments by ID
- get_readings: Get raw readings for a deployment (most recent first, up to 2000)
- get_device_stats: Get overall stats per device for any time range — not deployment-scoped. Great for broad analysis.
- get_chart_data: Get time-bucketed averages for trend analysis (e.g. hourly or daily averages)
- get_report_data: Get ALL deployments with full statistics in one call. Use this first when generating reports or comprehensive analyses.
- get_weather: Get the latest stored weather readings from the database, filtered by zip code or weather device ID. Use this for weather-specific queries.

HOW TO ANSWER COMMON QUESTIONS:
- "What's the last/latest/current temperature?": Use get_deployments to find the right deployment (filter by location if mentioned), then use get_readings with limit=1 to get the most recent reading.
- "Compare deployments": Use get_deployment_stats with the relevant deployment IDs.
- "What's the temperature in [location]?": Use get_deployments with the location filter, then get_readings with limit=1 for the latest value, or get_deployment_stats for an overview.
- "What's the weather in [zip code]?" / "Temperature in 85142?": Use get_weather with the zip code. This returns the latest stored weather data for that zip code — separate from sensor readings. If the user gives a location name instead of a zip, use get_deployments to find the zip_code first, then use get_weather.
- "Analyze all my data" / "Give me a full analysis": Use get_device_stats with a broad time range for overall stats, then get_chart_data with appropriate buckets to identify trends. Combine with get_deployments for context on locations.
- "How accurate are my sensors?" / "Compare sensors to official weather" / "Margin of error": Call get_device_stats with start 7 days ago and end now, with NO device_id filter. This returns stats for ALL devices — registered sensor nodes AND their official weather counterparts (weather_<device_id>). Compare each sensor to its weather counterpart. Calculate the difference (delta) and percent error for temperature and humidity. Frame results as sensor accuracy validation.
- "Show me trends" / "How has temperature changed?": Use get_chart_data with appropriate bucket sizes (15-60 min for a day, 1440 min for weeks/months).
- If a user references a room, location, or place name, search deployments by location OR name to find matching deployments. Filters use partial matching, so "Queen Creek" will find "Queen Creek, AZ" and "patio" will find "Nik's Patio".

REPORT GENERATION:
When asked to "generate a report", "write a report for my paper", "create an analysis document", or similar:
1. First call get_report_data to get the complete data overview
2. Then call get_chart_data with daily buckets (1440 min) for the full date range to identify trends
3. Optionally call get_chart_data with hourly buckets (60 min) for the most recent 7 days for finer detail
4. Synthesize everything into a structured report with these sections:

## Executive Summary
Brief overview of the monitoring project: how many deployments, total readings, date range, locations monitored.

## Data Collection Overview
Table of all deployments with their device, location, date range, and reading count.

## Per-Deployment Analysis
For each deployment: statistics (avg, min, max, std dev for temp and humidity), notable observations.

## Cross-Location Comparison
Compare deployments at different locations. Include deltas and interpret what the differences mean physically (e.g., "Location A averaged 2.3°F warmer than Location B, likely due to...").

## Trend Analysis
Describe how temperature and humidity changed over the monitoring period. Reference daily patterns, week-over-week changes, any anomalies or sudden shifts.

## Key Findings
Numbered list of the most important observations from the data.

## Suggestions for Further Analysis
What additional data collection or analysis could strengthen the findings.

Format the report in clean Markdown with headers, tables, and bullet points. This is meant as a first draft for an engineering class paper.

GUIDELINES:
- Use get_device_stats or get_deployment_stats for aggregate comparisons — more efficient than raw readings
- Use get_chart_data for trend analysis over time
- Use get_readings with a small limit for latest values, or a higher limit (up to 2000) when the user needs detailed data analysis
- When comparing, always note the time periods being compared
- Temperatures are provided in Fahrenheit
- Only discuss sensor data, deployments, and environmental analysis
- If asked about unrelated topics, politely redirect to sensor data
- Never fabricate data - if a deployment doesn't exist, say so
- This is a school data-gathering tool, so be helpful with analysis, observations, and insights

SENSOR CONTEXT:
- The physical sensors are deployed OUTDOORS, measuring the same outdoor conditions as official weather stations.
- There is NO indoor/outdoor distinction here. Both sensors and weather reference data measure outdoor conditions at the same locations.
- The purpose of the project is to gather outdoor environmental data and validate sensor accuracy by comparing against an official reference (WeatherAPI.com).
- When comparing sensor vs. weather data, frame it as "sensor accuracy" or "margin of error" — e.g. "sensor averaged 2.1°F higher than official weather (3.2% error)".
- See REGISTERED DEVICES (appended below) for the current list of sensor and weather device IDs.

WEATHER DATA:
- Official reference weather data is fetched periodically from WeatherAPI.com and stored in the database with device_id 'weather_<sensor_id>' (e.g. weather_node1 for node1).
- Weather device_ids contain the official WeatherAPI conditions for the same zip code/location as the corresponding sensor deployment.
- Use get_weather to retrieve the latest stored weather reading for a specific zip code or weather device ID.
- Use get_device_stats to compare a sensor's readings against its weather counterpart over a time range.
  Example: "How accurate is <device>?" → get_device_stats for both the sensor and its weather counterpart (weather_<device_id>), then calculate delta and % error.
- Stored weather data is NOT deployment-scoped, so get_readings won't return weather. Use get_weather, get_device_stats, or get_chart_data instead.
- When a user asks "what's the weather in [zip code]?", use get_weather — do NOT confuse this with sensor readings.

Keep responses concise and focused on actionable insights.`;

const getDeploymentsDecl: FunctionDeclaration = {
  name: 'get_deployments',
  description: 'List deployments. Returns id, name, device_id, location, zip_code, started_at, ended_at, and reading_count. Filters use case-insensitive partial matching.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      device_id: { type: SchemaType.STRING, description: 'Filter by device ID (see REGISTERED DEVICES)' },
      location: { type: SchemaType.STRING, description: 'Filter by location (partial match, e.g. "Queen Creek" matches "Queen Creek, AZ")' },
      name: { type: SchemaType.STRING, description: 'Filter by deployment name (partial match, e.g. "patio" matches "Nik\'s Patio")' },
      zip_code: { type: SchemaType.STRING, description: 'Filter by zip code (exact match, e.g. "85142")' },
      active_only: { type: SchemaType.BOOLEAN, description: 'Only return active deployments' },
    },
  },
};

const getDeploymentStatsDecl: FunctionDeclaration = {
  name: 'get_deployment_stats',
  description: 'Get temperature and humidity statistics for deployments. Returns avg, min, max, stddev.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      deployment_ids: {
        type: SchemaType.ARRAY,
        items: { type: SchemaType.NUMBER },
        description: 'List of deployment IDs to get stats for',
      },
    },
    required: ['deployment_ids'],
  },
};

const getReadingsDecl: FunctionDeclaration = {
  name: 'get_readings',
  description: 'Get sensor readings for a deployment, ordered most recent first. Use with limit=1 to get the latest reading. Use get_deployment_stats instead for aggregate stats (avg, min, max). For full data analysis, use a higher limit (up to 2000).',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      deployment_id: { type: SchemaType.NUMBER, description: 'The deployment ID' },
      limit: { type: SchemaType.NUMBER, description: 'Max readings to return (default 100, max 2000). Use 1 for latest reading, higher values for full analysis.' },
    },
    required: ['deployment_id'],
  },
};

const getDeviceStatsDecl: FunctionDeclaration = {
  name: 'get_device_stats',
  description: 'Get overall temperature and humidity statistics per device for a time range. Not deployment-scoped — covers all readings in the time window. Returns avg, min, max, stddev, reading_count per device. Useful for broad analysis across all data.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      start: { type: SchemaType.STRING, description: 'Start of time range (ISO 8601 datetime, e.g. "2025-01-01T00:00:00Z"). Use a very early date for all-time stats.' },
      end: { type: SchemaType.STRING, description: 'End of time range (ISO 8601 datetime). Use current time for up-to-now stats.' },
      device_id: { type: SchemaType.STRING, description: 'Filter by device ID — sensor or weather counterpart (see REGISTERED DEVICES). Omit for all devices.' },
    },
    required: ['start', 'end'],
  },
};

const getChartDataDecl: FunctionDeclaration = {
  name: 'get_chart_data',
  description: 'Get time-bucketed averages for charting and trend analysis. Groups readings into time buckets and returns the average temperature/humidity per bucket per device. Useful for identifying trends, patterns, and changes over time.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      start: { type: SchemaType.STRING, description: 'Start of time range (ISO 8601 datetime)' },
      end: { type: SchemaType.STRING, description: 'End of time range (ISO 8601 datetime)' },
      bucket_minutes: { type: SchemaType.NUMBER, description: 'Size of each time bucket in minutes (e.g. 15 for 15-min averages, 60 for hourly, 1440 for daily)' },
      device_id: { type: SchemaType.STRING, description: 'Filter by device ID — sensor or weather counterpart (see REGISTERED DEVICES). Omit for all devices.' },
    },
    required: ['start', 'end', 'bucket_minutes'],
  },
};

const getReportDataDecl: FunctionDeclaration = {
  name: 'get_report_data',
  description: 'Get a comprehensive data overview for report generation. Returns ALL deployments with their statistics, overall device stats, and metadata. Use this as the first call when generating a full analysis report.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {},
  },
};

const getWeatherDecl: FunctionDeclaration = {
  name: 'get_weather',
  description: 'Get the latest stored weather readings from the database. Weather data is fetched periodically from WeatherAPI.com and stored with source=\'weather\'. Returns temperature (C and F), humidity, zip code, and observation time. Use this when a user asks about current weather conditions for a zip code or location.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      zip_code: { type: SchemaType.STRING, description: 'Filter by US zip code (e.g. "85142")' },
      device_id: { type: SchemaType.STRING, description: 'Filter by weather device ID (e.g. "weather_<sensor_id>")' },
      limit: { type: SchemaType.NUMBER, description: 'Number of recent weather readings to return (default 1, max 100)' },
    },
  },
};

const TOOL_LABELS: Record<string, string> = {
  get_deployments: 'Looking up deployments',
  get_deployment_stats: 'Calculating statistics',
  get_readings: 'Fetching readings',
  get_device_stats: 'Analyzing device data',
  get_chart_data: 'Analyzing trends',
  get_report_data: 'Gathering all deployment data',
  get_weather: 'Fetching weather data',
};

// In-memory rate limiter — resets on deploy, sufficient for class project
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 30;

export function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(userId) || [];
  const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS);
  rateLimitMap.set(userId, valid);

  if (valid.length >= RATE_LIMIT_MAX) return false;

  valid.push(now);
  return true;
}

// Allow up to 120s for report generation (multi-step tool calls + Gemini response)
export const maxDuration = 120;

export async function POST(req: Request) {
  try {
    const user = await getServerUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!checkRateLimit(user.id)) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please wait a few minutes.' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { message, history, pageContext } = await req.json();

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Cap message length and history size to limit cost/latency abuse
    const cappedMessage = message.slice(0, 4000);
    const cappedHistory = Array.isArray(history) ? history.slice(-50) : [];

    const chatHistory = cappedHistory
      .map((msg) => {
        if (!msg || typeof msg !== 'object') return null;

        const role = (msg as { role?: unknown }).role === 'assistant' ? 'model' : 'user';
        const content = (msg as { content?: unknown }).content;
        const safeContent = typeof content === 'string' ? content : '';

        return {
          role,
          parts: [{ text: safeContent.slice(0, 8000) }],
        };
      })
      .filter(
        (
          msg
        ): msg is {
          role: 'model' | 'user';
          parts: Array<{ text: string }>;
        } => msg !== null
      );

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Inject current timestamp with timezone context so the model can compute relative time ranges
    const now = new Date();
    const azTime = now.toLocaleString('en-US', { timeZone: 'America/Phoenix' });
    let systemPrompt = SYSTEM_PROMPT +
      `\n\nCURRENT TIME: ${azTime} (Arizona, America/Phoenix).` +
      ` UTC equivalent: ${now.toISOString()}.` +
      ` Tool parameters (start/end) require UTC ISO 8601 strings.` +
      ` Tool responses return timestamps in Arizona local time.`;

    // Clamp individual fields to prevent oversized payloads sneaking into the prompt
    if (pageContext && typeof pageContext === 'object' && typeof pageContext.page === 'string') {
      const page = pageContext.page.slice(0, 30);
      let contextNote = `\n\nUSER CONTEXT: The user is currently on the "${page}" page`;
      if (typeof pageContext.timeRange === 'string') contextNote += `, viewing a ${pageContext.timeRange.slice(0, 20)} time range`;
      if (typeof pageContext.deviceFilter === 'string') contextNote += `, filtered to ${pageContext.deviceFilter.slice(0, 30)}`;
      if (typeof pageContext.deploymentId === 'number') contextNote += `, viewing deployment #${pageContext.deploymentId}`;
      contextNote += '. Use this context to provide more relevant answers when appropriate.';
      systemPrompt += contextNote;
    }

    try {
      const serverClient = getServerClient();
      const { data: deviceRows } = await serverClient
        .from('devices')
        .select('id, display_name')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });

      const registeredDevices = deviceRows || [];
      if (registeredDevices.length > 0) {
        const sensorList = registeredDevices.map(d => `${d.id} (${d.display_name})`).join(', ');
        const weatherList = registeredDevices.map(d => `weather_${d.id}`).join(', ');
        systemPrompt += `\n\nREGISTERED DEVICES: Sensors: ${sensorList}. Weather counterparts: ${weatherList}.`;
      }
    } catch (e) {
      console.error('Failed to fetch devices for chat context:', e);
    }

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: systemPrompt,
      tools: [{
        functionDeclarations: [getDeploymentsDecl, getDeploymentStatsDecl, getReadingsDecl, getDeviceStatsDecl, getChartDataDecl, getReportDataDecl, getWeatherDecl],
      }],
    });

    const chat = model.startChat({ history: chatHistory });

    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    const signal = req.signal;

    (async () => {
      try {
        if (signal.aborted) return;

        let response = await chat.sendMessage(cappedMessage, { signal });
        let result = response.response;

        // Max 10 iterations to prevent infinite tool-call loops
        let iterations = 0;
        let calls = result.functionCalls?.();
        while (calls && calls.length > 0 && iterations < 10) {
          if (signal.aborted) break;
          iterations++;
          const functionResponses = [];

          for (const call of calls) {
            if (signal.aborted) break;

            const label = TOOL_LABELS[call.name] || call.name;
            await writer.write(encoder.encode(`__STATUS__${label}\n`));

            try {
              const toolResult = await executeTool(call.name, call.args as Record<string, unknown>);
              functionResponses.push({
                functionResponse: {
                  name: call.name,
                  response: { result: toolResult },
                },
              });
            } catch (error) {
              console.error(`Tool ${call.name} failed:`, error);
              functionResponses.push({
                functionResponse: {
                  name: call.name,
                  response: { error: `The ${call.name} tool encountered an error. Please try a different approach.` },
                },
              });
            }
          }

          if (signal.aborted) break;

          response = await chat.sendMessage(functionResponses, { signal });
          result = response.response;
          calls = result.functionCalls?.();
        }

        if (signal.aborted) return;

        if (iterations >= 10 && calls && calls.length > 0) {
          await writer.write(encoder.encode(
            '\n\n*Note: This query required extensive data retrieval. The response may be incomplete — try asking a more specific question.*'
          ));
        }

        // Write final response in chunks for streaming feel
        let text = '';
        try {
          text = result.text();
        } catch (textError) {
          // text() throws if response was blocked or has no candidates
          const blockReason = result.candidates?.[0]?.finishReason;
          console.error('Gemini text() failed:', textError, '| finishReason:', blockReason);
          if (blockReason === 'SAFETY') {
            text = 'My response was filtered by safety settings. Please try rephrasing your question.';
          }
        }

        if (text) {
          const chunkSize = 100;
          for (let i = 0; i < text.length; i += chunkSize) {
            if (signal.aborted) return;
            await writer.write(encoder.encode(text.slice(i, i + chunkSize)));
          }
        } else {
          console.error('Gemini returned empty text. iterations:', iterations, '| pending calls:', calls?.length ?? 0);
          await writer.write(encoder.encode(
            'I wasn\'t able to generate a response for that query. Please try rephrasing or asking something more specific.'
          ));
        }
      } catch (error) {
        // Client disconnected — stop silently
        if (signal.aborted || (error as Error).name === 'AbortError') return;
        console.error('Chat streaming error:', error);
        try {
          await writer.write(encoder.encode('Sorry, an error occurred while processing your request. Please try again.'));
        } catch {
          // Writer closed (client disconnected) — ignore
        }
      } finally {
        try {
          await writer.close();
        } catch {
          // Writer may already be closed if client disconnected
        }
      }
    })();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    console.error('Chat route error:', error);
    return new Response(JSON.stringify({ error: 'An internal error occurred. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
