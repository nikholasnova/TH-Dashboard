import { GoogleGenerativeAI, SchemaType, FunctionDeclaration } from '@google/generative-ai';
import { executeTool } from '@/lib/aiTools';
import { getServerUser } from '@/lib/serverAuth';

const SYSTEM_PROMPT = `You are an AI assistant for an IoT temperature and humidity monitoring system.
You help users understand their sensor data across different deployments and locations.

CAPABILITIES:
- Query deployment information (locations, time ranges, devices)
- Get statistics for deployments (temperature/humidity avg, min, max, stddev)
- Retrieve raw readings when detailed analysis is needed
- Compare deployments across different locations, devices, or time periods

GUIDELINES:
- Use get_deployment_stats for comparisons (more efficient than raw readings)
- When comparing, always note the time periods being compared
- Temperatures are provided in Fahrenheit
- Only discuss sensor data, deployments, and environmental analysis
- If asked about unrelated topics, politely redirect to sensor data
- Never fabricate data - if a deployment doesn't exist, say so

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
  description: 'Get raw readings for a deployment. Use sparingly - prefer get_deployment_stats.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      deployment_id: { type: SchemaType.NUMBER, description: 'The deployment ID' },
      limit: { type: SchemaType.NUMBER, description: 'Max readings to return (default 100)' },
    },
    required: ['deployment_id'],
  },
};

export async function POST(req: Request) {
  try {
    // Check authentication
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

    // Convert frontend message history to Gemini format
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
        functionDeclarations: [getDeploymentsDecl, getDeploymentStatsDecl, getReadingsDecl],
      }],
    });

    const chat = model.startChat({ history: chatHistory });

    // Create streaming response
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Process in background
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
