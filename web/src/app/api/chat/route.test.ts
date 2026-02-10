// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ChatHistoryMessage = { role: string; parts: Array<{ text: string }> };
type StartChatInput = { history: ChatHistoryMessage[] };

const getServerUserMock = vi.fn();
const executeToolMock = vi.fn();
const sendMessageMock = vi.fn();
const startChatMock = vi.fn((input: StartChatInput) => {
  void input;
  return { sendMessage: sendMessageMock };
});
const getGenerativeModelMock = vi.fn(() => ({ startChat: startChatMock }));
const GoogleGenerativeAIMock = vi.fn(() => ({ getGenerativeModel: getGenerativeModelMock }));

vi.mock('@/lib/serverAuth', () => ({
  getServerUser: getServerUserMock,
}));

vi.mock('@/lib/aiTools', () => ({
  executeTool: executeToolMock,
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: GoogleGenerativeAIMock,
  SchemaType: {
    OBJECT: 'object',
    STRING: 'string',
    BOOLEAN: 'boolean',
    ARRAY: 'array',
    NUMBER: 'number',
  },
}));

function makeModelResult(text: string, calls?: Array<{ name: string; args: Record<string, unknown> }>) {
  return {
    response: {
      functionCalls: () => calls,
      text: () => text,
    },
  };
}

describe('/api/chat route', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    process.env = { ...originalEnv };
    process.env.GOOGLE_API_KEY = 'test-google-key';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    getServerUserMock.mockResolvedValue(null);
    const { POST } = await import('./route');

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hi' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 400 when message is missing or invalid', async () => {
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
    const { POST } = await import('./route');

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 42 }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Message is required' });
  });

  it('caps message and history before forwarding to Gemini', async () => {
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
    sendMessageMock.mockResolvedValue(makeModelResult('final response'));

    const { POST } = await import('./route');

    const longMessage = 'x'.repeat(5000);
    const history = Array.from({ length: 70 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `msg-${i}-` + 'y'.repeat(9000),
    }));

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: longMessage, history }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('final response');

    expect(GoogleGenerativeAIMock).toHaveBeenCalledWith('test-google-key');
    expect(startChatMock).toHaveBeenCalledTimes(1);
    const startChatArg = startChatMock.mock.calls[0]?.[0];
    expect(startChatArg).toBeDefined();
    if (!startChatArg) throw new Error('Expected startChat to be called with history');
    expect(startChatArg.history).toHaveLength(50);
    expect(
      startChatArg.history.every((msg) => (msg.parts[0]?.text?.length || 0) <= 8000)
    ).toBe(true);

    expect(sendMessageMock).toHaveBeenCalled();
    const firstSentMessage = sendMessageMock.mock.calls[0]?.[0];
    expect(typeof firstSentMessage).toBe('string');
    if (typeof firstSentMessage !== 'string') throw new Error('Expected first sendMessage call to be a string');
    expect(firstSentMessage.length).toBe(4000);
  });

  it('sanitizes malformed history entries without crashing', async () => {
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
    sendMessageMock.mockResolvedValue(makeModelResult('ok'));

    const { POST } = await import('./route');

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'hello',
        history: [
          null,
          123,
          { role: 'assistant', content: 99 },
          { role: 'user', content: 'valid history message' },
          { role: 'assistant', content: 'x'.repeat(9000) },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('ok');

    const startChatArg = startChatMock.mock.calls[0]?.[0];
    expect(startChatArg).toBeDefined();
    if (!startChatArg) throw new Error('Expected startChat to receive history');

    expect(startChatArg.history).toHaveLength(3);
    expect(startChatArg.history[0].parts[0].text).toBe('');
    expect(startChatArg.history[2].parts[0].text.length).toBe(8000);
  });

  it('returns 500 when GOOGLE_API_KEY is missing', async () => {
    delete process.env.GOOGLE_API_KEY;
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
    const { POST } = await import('./route');

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'API key not configured' });
  });

  it('enforces per-user rate limits', async () => {
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
    sendMessageMock.mockResolvedValue(makeModelResult('ok'));
    const { POST } = await import('./route');

    const req = () =>
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'hello' }),
      });

    for (let i = 0; i < 30; i += 1) {
      const res = await POST(req());
      expect(res.status).toBe(200);
    }

    const limited = await POST(req());
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({
      error: 'Rate limit exceeded. Please wait a few minutes.',
    });
  });

  it('handles tool-call loop and emits tool status markers', async () => {
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
    executeToolMock.mockResolvedValue([{ id: 1, name: 'Patio' }]);
    sendMessageMock
      .mockResolvedValueOnce(
        makeModelResult('', [{ name: 'get_deployments', args: { active_only: true } }])
      )
      .mockResolvedValueOnce(makeModelResult('done'));

    const { POST } = await import('./route');

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'list deployments' }),
    });

    const res = await POST(req);
    const text = await res.text();
    expect(text).toContain('__STATUS__Looking up deployments');
    expect(text).toContain('done');
    expect(executeToolMock).toHaveBeenCalledWith(
      'get_deployments',
      expect.objectContaining({ active_only: true })
    );
  });

  it('falls back to safe guidance when model text() is unavailable', async () => {
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
    sendMessageMock.mockResolvedValue({
      response: {
        functionCalls: () => undefined,
        text: () => {
          throw new Error('no candidates');
        },
      },
    });

    const { POST } = await import('./route');
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain(
      "I wasn't able to generate a response for that query. Please try rephrasing or asking something more specific."
    );
  });

  it('returns generic 500 response for unexpected route errors', async () => {
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
    const { POST } = await import('./route');

    const badReq = {
      json: async () => {
        throw new Error('explode');
      },
    } as unknown as Request;

    const res = await POST(badReq);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({
      error: 'An internal error occurred. Please try again.',
    });
  });
});
