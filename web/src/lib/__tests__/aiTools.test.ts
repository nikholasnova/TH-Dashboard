// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { executeTool } from '../aiTools';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

describe('aiTools executeTool', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
  });

  it('returns get_deployment_stats as a stable object shape', async () => {
    const rpc = vi.fn(async () => ({
      data: [
        {
          deployment_id: 1,
          deployment_name: 'Patio',
          device_id: 'node1',
          location: 'Queen Creek',
          temp_avg: 20,
          temp_min: 18,
          temp_max: 22,
          temp_stddev: 1,
          humidity_avg: 45,
          humidity_min: 40,
          humidity_max: 50,
          humidity_stddev: 2,
          reading_count: 100,
        },
      ],
      error: null,
    }));

    vi.mocked(createClient).mockReturnValue({ rpc } as never);

    const result = await executeTool('get_deployment_stats', { deployment_ids: [1] }) as {
      stats: Array<{ temp_avg_f: number; temp_stddev_f: number }>;
      note?: string;
    };

    expect(Array.isArray(result.stats)).toBe(true);
    expect(result.note).toBeUndefined();
    expect(result.stats[0].temp_avg_f).toBe(68);
    expect(result.stats[0].temp_stddev_f).toBe(1.8);
  });

  it('caps deployment_ids at 100 and includes truncation note', async () => {
    const rpc = vi.fn(async (_fn: string, args: { deployment_ids?: number[] }) => ({
      data: [
        {
          deployment_id: args.deployment_ids?.[0] || 1,
          deployment_name: 'Patio',
          device_id: 'node1',
          location: 'Queen Creek',
          temp_avg: 20,
          temp_min: 18,
          temp_max: 22,
          temp_stddev: 1,
          humidity_avg: 45,
          humidity_min: 40,
          humidity_max: 50,
          humidity_stddev: 2,
          reading_count: 100,
        },
      ],
      error: null,
    }));

    vi.mocked(createClient).mockReturnValue({ rpc } as never);

    const ids = Array.from({ length: 150 }, (_, i) => i + 1);
    const result = await executeTool('get_deployment_stats', { deployment_ids: ids }) as {
      stats: unknown[];
      note?: string;
    };

    expect(rpc).toHaveBeenCalledWith(
      'get_deployment_stats',
      expect.objectContaining({
        deployment_ids: expect.any(Array),
      })
    );
    const rpcArgs = rpc.mock.calls[0]?.[1] as { deployment_ids: number[] };
    expect(rpcArgs.deployment_ids).toHaveLength(100);
    expect(result.note).toContain('first 100 deployments');
    expect(Array.isArray(result.stats)).toBe(true);
  });

  it('propagates report truncation note through get_report_data tool output', async () => {
    const deployments = Array.from({ length: 101 }, (_, i) => ({
      id: i + 1,
      device_id: i % 2 === 0 ? 'node1' : 'node2',
      name: `Deployment ${i + 1}`,
      location: 'Queen Creek',
      notes: null,
      zip_code: '85142',
      started_at: '2026-01-01T00:00:00.000Z',
      ended_at: null,
      created_at: '2026-01-01T00:00:00.000Z',
    }));

    const from = vi.fn((table: string) => {
      if (table === 'deployments') {
        const query: Record<string, unknown> = {};
        query.select = vi.fn(() => query);
        query.eq = vi.fn(() => query);
        query.ilike = vi.fn(() => query);
        query.is = vi.fn(() => query);
        query.order = vi.fn(async () => ({ data: deployments, error: null }));
        return query;
      }

      if (table === 'readings') {
        const query: Record<string, unknown> = {};
        query.select = vi.fn(() => query);
        query.eq = vi.fn(() => query);
        query.gte = vi.fn(() => query);
        query.lte = vi.fn(async () => ({ count: 3, error: null }));
        return query;
      }

      throw new Error(`Unexpected table: ${table}`);
    });

    const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'get_deployment_stats') {
        const deploymentIds = (args.deployment_ids as number[]) || [];
        return {
          data: deploymentIds.map((id) => ({
            deployment_id: id,
            deployment_name: `Deployment ${id}`,
            device_id: id % 2 === 0 ? 'node1' : 'node2',
            location: 'Queen Creek',
            temp_avg: 20,
            temp_min: 18,
            temp_max: 22,
            temp_stddev: 1,
            humidity_avg: 45,
            humidity_min: 40,
            humidity_max: 50,
            humidity_stddev: 2,
            reading_count: 50,
          })),
          error: null,
        };
      }

      if (fn === 'get_device_stats') {
        return {
          data: [
            {
              device_id: 'node1',
              temp_avg: 20,
              temp_min: 18,
              temp_max: 22,
              temp_stddev: 1,
              humidity_avg: 45,
              humidity_min: 40,
              humidity_max: 50,
              humidity_stddev: 2,
              reading_count: 1000,
            },
          ],
          error: null,
        };
      }

      return { data: [], error: null };
    });

    vi.mocked(createClient).mockReturnValue({ from, rpc } as never);

    const result = await executeTool('get_report_data', {}) as {
      deployment_stats: unknown[];
      note?: string;
    };

    expect(result.deployment_stats).toHaveLength(100);
    expect(result.note).toContain('first 100 deployments');
  });

  it('converts get_readings temperature to fahrenheit', async () => {
    const deploymentQuery: Record<string, unknown> = {};
    deploymentQuery.select = vi.fn(() => deploymentQuery);
    deploymentQuery.eq = vi.fn(() => deploymentQuery);
    deploymentQuery.single = vi.fn(async () => ({
      data: {
        id: 1,
        device_id: 'node1',
        name: 'Patio',
        location: 'Queen Creek',
        notes: null,
        zip_code: '85142',
        started_at: '2026-01-01T00:00:00.000Z',
        ended_at: null,
        created_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    }));

    const readingsQuery: Record<string, unknown> = {};
    readingsQuery.select = vi.fn(() => readingsQuery);
    readingsQuery.eq = vi.fn(() => readingsQuery);
    readingsQuery.gte = vi.fn(() => readingsQuery);
    readingsQuery.order = vi.fn(() => readingsQuery);
    readingsQuery.limit = vi.fn(async () => ({
      data: [
        {
          id: 10,
          device_id: 'node1',
          temperature: 20,
          humidity: 45,
          created_at: '2026-02-10T00:00:00.000Z',
        },
      ],
      error: null,
    }));

    const from = vi.fn((table: string) => {
      if (table === 'deployments') return deploymentQuery;
      if (table === 'readings') return readingsQuery;
      throw new Error(`Unexpected table: ${table}`);
    });

    vi.mocked(createClient).mockReturnValue({ from, rpc: vi.fn() } as never);

    const result = await executeTool('get_readings', { deployment_id: 1, limit: 1 }) as Array<{
      temperature_f: number;
    }>;
    expect(result[0].temperature_f).toBe(68);
  });

  it('throws on unknown tools', async () => {
    await expect(executeTool('unknown_tool', {})).rejects.toThrow('Unknown tool');
  });

  it('validates zip codes for get_weather', async () => {
    const query: Record<string, unknown> = {};
    query.select = vi.fn(() => query);
    query.eq = vi.fn(() => query);
    query.order = vi.fn(() => query);
    query.limit = vi.fn(async () => ({ data: [], error: null }));

    vi.mocked(createClient).mockReturnValue({
      from: vi.fn(() => query),
      rpc: vi.fn(),
    } as never);

    await expect(executeTool('get_weather', { zip_code: 'bad' })).rejects.toThrow(
      'Invalid US zip code'
    );
  });
});
