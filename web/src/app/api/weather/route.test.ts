// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildWeatherTargets, GET, getUtcHourBucketRange } from './route';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

type DeploymentsResponse = {
  data: Array<{
    id: number;
    device_id: string;
    zip_code: string | null;
    started_at: string;
  }> | null;
  error: { message: string } | null;
};

function makeDeploymentsQuery(response: DeploymentsResponse) {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.is = vi.fn(() => query);
  query.not = vi.fn(() => query);
  query.order = vi.fn(async () => response);
  return query;
}

function makeMockSupabase(params: {
  deployments: DeploymentsResponse;
  existingCounts?: number[];
}) {
  const existingCounts = [...(params.existingCounts || [])];
  const insertedRows: Array<Record<string, unknown>> = [];

  const from = vi.fn((table: string) => {
    if (table === 'deployments') {
      return makeDeploymentsQuery(params.deployments);
    }

    if (table === 'readings') {
      const query: Record<string, unknown> = {};
      query.select = vi.fn(() => query);
      query.eq = vi.fn(() => query);
      query.gte = vi.fn(() => query);
      query.lt = vi.fn(async () => ({
        count: existingCounts.shift() ?? 0,
        error: null,
      }));
      query.insert = vi.fn(async (row: Record<string, unknown>) => {
        insertedRows.push(row);
        return { error: null };
      });
      return query;
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return {
    client: { from },
    insertedRows,
  };
}

describe('/api/weather route', () => {
  const originalEnv = { ...process.env };
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = 'secret';
    process.env.WEATHER_API_KEY = 'weather-key';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    global.fetch = originalFetch;
  });

  it('returns 401 when cron secret is invalid', async () => {
    const request = new NextRequest('http://localhost/api/weather');
    const response = await GET(request);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
  });

  it('returns 500 when service-role env is missing', async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const request = new NextRequest('http://localhost/api/weather?secret=secret');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(String(body.error)).toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(createClient).not.toHaveBeenCalled();
  });

  it('dedupes active deployments per device and skips existing hourly weather rows', async () => {
    const supabaseMock = makeMockSupabase({
      deployments: {
        data: [
          {
            id: 11,
            device_id: 'node1',
            zip_code: '85142',
            started_at: '2026-02-06T10:00:00Z',
          },
          {
            id: 10,
            device_id: 'node1',
            zip_code: '85142',
            started_at: '2026-02-06T09:00:00Z',
          },
          {
            id: 12,
            device_id: 'node2',
            zip_code: '85142',
            started_at: '2026-02-06T10:30:00Z',
          },
          {
            id: 13,
            device_id: 'node3',
            zip_code: 'not-a-zip',
            started_at: '2026-02-06T10:30:00Z',
          },
        ],
        error: null,
      },
      existingCounts: [0, 1],
    });

    vi.mocked(createClient).mockReturnValue(supabaseMock.client as never);
    global.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          current: {
            temp_c: 22.5,
            humidity: 40,
            last_updated_epoch: 1765363200,
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as typeof fetch;

    const request = new NextRequest('http://localhost/api/weather?secret=secret');
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.fetched_count).toBe(1);
    expect(body.inserted_count).toBe(1);
    expect(body.skipped_existing_count).toBe(1);
    expect(body.invalid_zip_count).toBe(1);
    expect(body.duplicate_active_device_count).toBe(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(global.fetch).mock.calls[0][0])).toContain('q=85142');
    expect(supabaseMock.insertedRows[0]).toMatchObject({
      device_id: 'weather_node1',
      source: 'weather',
      deployment_id: 11,
      zip_code: '85142',
      temperature: 22.5,
      humidity: 40,
    });
  });
});

describe('weather route helpers', () => {
  it('builds UTC hour bucket boundaries', () => {
    const { startIso, endIso } = getUtcHourBucketRange(
      new Date('2026-02-06T16:43:20.000Z')
    );
    expect(startIso).toBe('2026-02-06T16:00:00.000Z');
    expect(endIso).toBe('2026-02-06T17:00:00.000Z');
  });

  it('selects latest active deployment per device and groups by zip', () => {
    const result = buildWeatherTargets([
      {
        id: 1,
        device_id: 'node1',
        zip_code: '85142',
        started_at: '2026-02-06T10:00:00Z',
      },
      {
        id: 2,
        device_id: 'node1',
        zip_code: '85142',
        started_at: '2026-02-06T09:00:00Z',
      },
      {
        id: 3,
        device_id: 'node2',
        zip_code: '85001',
        started_at: '2026-02-06T08:00:00Z',
      },
      {
        id: 4,
        device_id: 'node3',
        zip_code: 'bad',
        started_at: '2026-02-06T07:00:00Z',
      },
    ]);

    expect(result.invalidZipCount).toBe(1);
    expect(result.duplicateActiveDeviceCount).toBe(1);
    expect(result.targetsByZip.get('85142')?.[0]).toMatchObject({
      deploymentId: 1,
      deviceId: 'node1',
    });
    expect(result.targetsByZip.get('85001')?.[0]).toMatchObject({
      deploymentId: 3,
      deviceId: 'node2',
    });
  });
});
