import { GoogleGenerativeAI, SchemaType, FunctionDeclaration } from '@google/generative-ai';
import { executeTool } from '@/lib/aiTools';
import { getServerUser } from '@/lib/serverAuth';

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
- get_deployments: List deployments with optional filters (device, location, active status)
- get_deployment_stats: Get aggregate stats for specific deployments by ID
- get_readings: Get raw readings for a deployment (most recent first, up to 2000)
- get_device_stats: Get overall stats per device for any time range — not deployment-scoped. Great for broad analysis.
- get_chart_data: Get time-bucketed averages for trend analysis (e.g. hourly or daily averages)

HOW TO ANSWER COMMON QUESTIONS:
- "What's the last/latest/current temperature?": Use get_deployments to find the right deployment (filter by location if mentioned), then use get_readings with limit=1 to get the most recent reading.
- "Compare deployments": Use get_deployment_stats with the relevant deployment IDs.
- "What's the temperature in [location]?": Use get_deployments with the location filter, then get_readings with limit=1 for the latest value, or get_deployment_stats for an overview.
- "Analyze all my data" / "Give me a full analysis": Use get_device_stats with a broad time range for overall stats, then get_chart_data with appropriate buckets to identify trends. Combine with get_deployments for context on locations.
- "Show me trends" / "How has temperature changed?": Use get_chart_data with appropriate bucket sizes (15-60 min for a day, 1440 min for weeks/months).
- If a user references a room, location, or place name, search deployments by location to find matching deployments.

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

Keep responses concise and focused on actionable insights.`;

// Tool declarations
const getDeploymentsDecl: FunctionDeclaration = {
  name: 'get_deployments',
  description: 'List deployments. Returns id, name, device_id, location, started_at, ended_at, and reading_count.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      device_id: { type: SchemaType.STRING, description: 'Filter by device (node1 or node2)' },
      location: { type: SchemaType.STRING, description: 'Filter by location name' },
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
      device_id: { type: SchemaType.STRING, description: 'Optional device filter (node1 or node2). Omit for all devices.' },
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
      device_id: { type: SchemaType.STRING, description: 'Optional device filter (node1 or node2). Omit for all devices.' },
    },
    required: ['start', 'end', 'bucket_minutes'],
  },
};

export async function POST(req: Request) {
  try {
    const user = await getServerUser();
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { message, history } = await req.json();

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Gemini uses 'model' instead of 'assistant'
    const chatHistory = (history || []).map((msg: { role: string; content: string }) => ({
      role: msg.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: msg.content }],
    }));

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: SYSTEM_PROMPT,
      tools: [{
        functionDeclarations: [getDeploymentsDecl, getDeploymentStatsDecl, getReadingsDecl, getDeviceStatsDecl, getChartDataDecl],
      }],
    });

    const chat = model.startChat({ history: chatHistory });

    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    (async () => {
      try {
        let response = await chat.sendMessage(message);
        let result = response.response;

        // Handle tool calls in a loop (max 5 iterations to prevent infinite loops)
        let iterations = 0;
        let calls = result.functionCalls?.();
        while (calls && calls.length > 0 && iterations < 5) {
          iterations++;
          const functionResponses = [];

          for (const call of calls) {
            try {
              const toolResult = await executeTool(call.name, call.args as Record<string, unknown>);
              functionResponses.push({
                functionResponse: {
                  name: call.name,
                  response: { result: toolResult },
                },
              });
            } catch (error) {
              functionResponses.push({
                functionResponse: {
                  name: call.name,
                  response: { error: String(error) },
                },
              });
            }
          }

          response = await chat.sendMessage(functionResponses);
          result = response.response;
          calls = result.functionCalls?.();
        }

        const text = result.text();
        if (text) {
          await writer.write(encoder.encode(text));
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await writer.write(encoder.encode(`Error: ${errorMessage}`));
      } finally {
        await writer.close();
      }
    })();

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
