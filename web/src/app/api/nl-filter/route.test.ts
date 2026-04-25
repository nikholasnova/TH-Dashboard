// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerUserMock = vi.fn();
const enforceOriginMock = vi.fn(() => null);
const getServerClientMock = vi.fn();
const nlFilterLimitMock = vi.fn(async () => ({ success: true }));
const generateContentMock = vi.fn();
const getGenerativeModelMock = vi.fn(() => ({ generateContent: generateContentMock }));
const GoogleGenerativeAIMock = vi.fn(function () {
  return { getGenerativeModel: getGenerativeModelMock };
});

vi.mock('@/lib/serverAuth', () => ({
  getServerUser: getServerUserMock,
  enforceOrigin: enforceOriginMock,
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: getServerClientMock,
}));

vi.mock('@/lib/rateLimiter', () => ({
  nlFilterLimiter: { limit: nlFilterLimitMock },
}));

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: GoogleGenerativeAIMock,
}));

function makeDevicesQuery() {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.order = vi.fn(async () => ({
    data: [
      { id: 'node1', display_name: 'Node 1' },
      { id: 'node2', display_name: 'Node 2' },
    ],
    error: null,
  }));
  return query;
}

describe('/api/nl-filter route', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.GOOGLE_API_KEY = 'test-google-key';
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
    getServerClientMock.mockReturnValue({
      from: vi.fn(() => makeDevicesQuery()),
    });
  });

  it('requires authentication', async () => {
    getServerUserMock.mockResolvedValue(null);
    const { POST } = await import('./route');

    const res = await POST(new Request('http://localhost/api/nl-filter', {
      method: 'POST',
      body: JSON.stringify({ query: 'hot readings' }),
    }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('sanitizes model-controlled filter JSON before returning it', async () => {
    generateContentMock.mockResolvedValue({
      response: {
        text: () => JSON.stringify({
          deviceIds: ['node1', 'weather_node1', 'node999', 'node1'],
          rangePreset: 'custom',
          customStart: '2026-01-01T00:00:00.000Z',
          customEnd: '2026-01-08T00:00:00.000Z',
          minTempF: 85,
          maxTempF: 9999,
          minHumidity: -1,
          maxHumidity: 80,
          source: 'sql',
          anomaliesOnly: true,
        }),
      },
    });
    const { POST } = await import('./route');

    const res = await POST(new Request('http://localhost/api/nl-filter', {
      method: 'POST',
      body: JSON.stringify({ query: 'find bad stuff' }),
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      filter: {
        deviceIds: ['node1'],
        rangePreset: 'custom',
        customStart: '2026-01-01T00:00:00.000Z',
        customEnd: '2026-01-08T00:00:00.000Z',
        minTempF: 85,
        maxHumidity: 80,
        anomaliesOnly: true,
      },
    });
  });

  it('drops invalid custom ranges', async () => {
    generateContentMock.mockResolvedValue({
      response: {
        text: () => JSON.stringify({
          rangePreset: 'custom',
          customStart: '2026-01-08T00:00:00.000Z',
          customEnd: '2026-01-01T00:00:00.000Z',
          source: 'weather',
        }),
      },
    });
    const { POST } = await import('./route');

    const res = await POST(new Request('http://localhost/api/nl-filter', {
      method: 'POST',
      body: JSON.stringify({ query: 'weather backwards' }),
    }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      filter: {
        source: 'weather',
      },
    });
  });
});
