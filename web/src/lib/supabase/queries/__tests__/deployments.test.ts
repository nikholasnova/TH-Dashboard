import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockSupabase: ReturnType<typeof createMockSupabase> | null;
let resolveQueue: Array<{ data: unknown; error: unknown }>;

function createMockChain() {
  const chain: Record<string, unknown> = {};
  const handler = () => chain;
  for (const m of [
    'select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte',
    'is', 'order', 'limit', 'single', 'maybeSingle', 'range',
  ]) {
    chain[m] = vi.fn(handler);
  }
  chain.then = (resolve: (v: unknown) => void) => {
    const next = resolveQueue.shift() || { data: null, error: null };
    resolve(next);
  };
  return chain;
}

function createMockSupabase() {
  const chain = createMockChain();
  return {
    from: vi.fn(() => chain),
    rpc: vi.fn(() => chain),
    _chain: chain,
  };
}

function enqueue(data: unknown, error: unknown = null) {
  resolveQueue.push({ data, error });
}

vi.mock('../../client', () => ({
  get supabase() {
    return mockSupabase;
  },
}));

vi.mock('../../../weatherZip', () => ({
  normalizeUsZipCode: vi.fn((z: string) => z.slice(0, 5)),
}));

import {
  getDeployments,
  getDeployment,
  createDeployment,
  updateDeployment,
  endDeployment,
  deleteDeployment,
  getActiveDeployment,
  getDeploymentStats,
  getDeploymentReadings,
  getDistinctLocations,
} from '../deployments';

describe('deployments queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveQueue = [];
    mockSupabase = createMockSupabase();
  });

  describe('getDeployments', () => {
    it('returns deployments without filters', async () => {
      const deps = [{ id: 1, name: 'Patio' }];
      enqueue(deps);
      const result = await getDeployments();
      expect(result).toEqual(deps);
      expect(mockSupabase!.rpc).toHaveBeenCalledWith('get_deployments_with_counts', {
        p_device_id: null,
        p_active_only: false,
      });
    });

    it('filters by deviceId', async () => {
      enqueue([]);
      await getDeployments({ deviceId: 'node1' });
      expect(mockSupabase!.rpc).toHaveBeenCalledWith('get_deployments_with_counts', expect.objectContaining({
        p_device_id: 'node1',
      }));
    });

    it('filters by location client-side', async () => {
      enqueue([
        { id: 1, location: 'Kitchen' },
        { id: 2, location: 'Patio' },
      ]);
      const result = await getDeployments({ location: 'Patio' });
      expect(result).toEqual([{ id: 2, location: 'Patio' }]);
    });

    it('filters by status active', async () => {
      enqueue([]);
      await getDeployments({ status: 'active' });
      expect(mockSupabase!.rpc).toHaveBeenCalledWith('get_deployments_with_counts', expect.objectContaining({
        p_active_only: true,
      }));
    });

    it('filters by status ended client-side', async () => {
      enqueue([
        { id: 1, ended_at: null },
        { id: 2, ended_at: '2024-01-01' },
      ]);
      const result = await getDeployments({ status: 'ended' });
      expect(result).toEqual([{ id: 2, ended_at: '2024-01-01' }]);
    });

    it('returns empty array when supabase is null', async () => {
      mockSupabase = null;
      expect(await getDeployments()).toEqual([]);
    });

    it('returns empty array on error', async () => {
      enqueue(null, { message: 'Error' });
      expect(await getDeployments()).toEqual([]);
    });
  });

  describe('getDeployment', () => {
    it('returns a deployment by id', async () => {
      const dep = { id: 1, name: 'Test' };
      enqueue(dep);
      expect(await getDeployment(1)).toEqual(dep);
      expect(mockSupabase!._chain.eq).toHaveBeenCalledWith('id', 1);
      expect(mockSupabase!._chain.single).toHaveBeenCalled();
    });

    it('returns null when supabase is null', async () => {
      mockSupabase = null;
      expect(await getDeployment(1)).toBeNull();
    });

    it('returns null on error', async () => {
      enqueue(null, { message: 'Error' });
      expect(await getDeployment(1)).toBeNull();
    });
  });

  describe('createDeployment', () => {
    it('creates a deployment with all fields', async () => {
      const dep = { id: 1, name: 'Patio' };
      enqueue(dep);
      const result = await createDeployment({
        device_id: 'node1',
        name: 'Patio',
        location: 'Backyard',
        notes: 'Test',
        zip_code: '85142-1234',
        started_at: '2024-01-01T00:00:00Z',
      });
      expect(result).toEqual(dep);
      expect(mockSupabase!._chain.insert).toHaveBeenCalledWith(expect.objectContaining({
        device_id: 'node1',
        name: 'Patio',
        location: 'Backyard',
        notes: 'Test',
        zip_code: '85142',
        started_at: '2024-01-01T00:00:00Z',
      }));
    });

    it('creates with null notes and zip when omitted', async () => {
      enqueue({ id: 1 });
      await createDeployment({ device_id: 'node1', name: 'Test', location: 'Lab' });
      expect(mockSupabase!._chain.insert).toHaveBeenCalledWith(expect.objectContaining({
        notes: null,
        zip_code: null,
      }));
    });

    it('returns null when supabase is null', async () => {
      mockSupabase = null;
      expect(await createDeployment({ device_id: 'x', name: 'X', location: 'X' })).toBeNull();
    });

    it('returns null on error', async () => {
      enqueue(null, { message: 'Error' });
      expect(await createDeployment({ device_id: 'x', name: 'X', location: 'X' })).toBeNull();
    });
  });

  describe('updateDeployment', () => {
    it('updates deployment fields', async () => {
      const dep = { id: 1, name: 'Updated' };
      enqueue(dep);
      expect(await updateDeployment(1, { name: 'Updated' })).toEqual(dep);
      expect(mockSupabase!._chain.update).toHaveBeenCalledWith({ name: 'Updated' });
    });

    it('normalizes zip_code when non-null', async () => {
      enqueue({ id: 1 });
      await updateDeployment(1, { zip_code: '85142-1234' });
      expect(mockSupabase!._chain.update).toHaveBeenCalledWith(expect.objectContaining({
        zip_code: '85142',
      }));
    });

    it('passes null zip_code through without normalization', async () => {
      enqueue({ id: 1 });
      await updateDeployment(1, { zip_code: null });
      expect(mockSupabase!._chain.update).toHaveBeenCalledWith(expect.objectContaining({
        zip_code: null,
      }));
    });

    it('returns null when supabase is null', async () => {
      mockSupabase = null;
      expect(await updateDeployment(1, { name: 'X' })).toBeNull();
    });

    it('returns null on error', async () => {
      enqueue(null, { message: 'Error' });
      expect(await updateDeployment(1, { name: 'X' })).toBeNull();
    });
  });

  describe('endDeployment', () => {
    it('sets ended_at and returns deployment', async () => {
      const dep = { id: 1, ended_at: '2024-01-01' };
      enqueue(dep);
      expect(await endDeployment(1)).toEqual(dep);
      expect(mockSupabase!._chain.update).toHaveBeenCalled();
      expect(mockSupabase!._chain.eq).toHaveBeenCalledWith('id', 1);
    });

    it('returns null when supabase is null', async () => {
      mockSupabase = null;
      expect(await endDeployment(1)).toBeNull();
    });

    it('returns null on error', async () => {
      enqueue(null, { message: 'Error' });
      expect(await endDeployment(1)).toBeNull();
    });
  });

  describe('deleteDeployment', () => {
    it('deletes via rpc and returns true', async () => {
      enqueue(null);
      expect(await deleteDeployment(1)).toBe(true);
      expect(mockSupabase!.rpc).toHaveBeenCalledWith('delete_deployment_cascade', { p_deployment_id: 1 });
    });

    it('returns false when supabase is null', async () => {
      mockSupabase = null;
      expect(await deleteDeployment(1)).toBe(false);
    });

    it('returns false on error', async () => {
      enqueue(null, { message: 'Error' });
      expect(await deleteDeployment(1)).toBe(false);
    });
  });

  describe('getActiveDeployment', () => {
    it('returns the active deployment for a device', async () => {
      const dep = { id: 1, device_id: 'node1', ended_at: null };
      enqueue(dep);
      expect(await getActiveDeployment('node1')).toEqual(dep);
      expect(mockSupabase!._chain.eq).toHaveBeenCalledWith('device_id', 'node1');
      expect(mockSupabase!._chain.is).toHaveBeenCalledWith('ended_at', null);
    });

    it('returns null when supabase is null', async () => {
      mockSupabase = null;
      expect(await getActiveDeployment('node1')).toBeNull();
    });

    it('returns null on error', async () => {
      enqueue(null, { message: 'Error' });
      expect(await getActiveDeployment('node1')).toBeNull();
    });
  });

  describe('getDeploymentStats', () => {
    it('returns stats for deployment ids', async () => {
      const stats = [{ deployment_id: 1, temp_avg: 22 }];
      enqueue(stats);
      expect(await getDeploymentStats([1])).toEqual(stats);
      expect(mockSupabase!.rpc).toHaveBeenCalledWith('get_deployment_stats', { deployment_ids: [1] });
    });

    it('returns empty array for empty ids', async () => {
      expect(await getDeploymentStats([])).toEqual([]);
    });

    it('returns empty array when supabase is null', async () => {
      mockSupabase = null;
      expect(await getDeploymentStats([1])).toEqual([]);
    });

    it('returns empty array on error', async () => {
      enqueue(null, { message: 'Error' });
      expect(await getDeploymentStats([1])).toEqual([]);
    });
  });

  describe('getDeploymentReadings', () => {
    const deployment = {
      id: 1,
      device_id: 'node1',
      name: 'Test',
      location: 'Lab',
      started_at: '2024-01-01T00:00:00Z',
      ended_at: '2024-01-02T00:00:00Z',
    };

    it('returns readings with limit (ascending)', async () => {
      enqueue(deployment); // getDeployment call
      const readings = [{ id: 1, created_at: '2024-01-01T01:00:00Z' }];
      enqueue(readings); // readings query
      const result = await getDeploymentReadings(1, 100);
      expect(result).toEqual(readings);
    });

    it('returns readings with preferLatest sorted ascending', async () => {
      enqueue(deployment);
      const readings = [
        { id: 2, created_at: '2024-01-01T02:00:00Z' },
        { id: 1, created_at: '2024-01-01T01:00:00Z' },
      ];
      enqueue(readings);
      const result = await getDeploymentReadings(1, 100, { preferLatest: true });
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
    });

    it('paginates when no limit is set', async () => {
      enqueue(deployment);
      // First page: 1000 items
      const page1 = Array.from({ length: 1000 }, (_, i) => ({
        id: i,
        created_at: '2024-01-01T01:00:00Z',
      }));
      enqueue(page1);
      // Second page: fewer than 1000 (end of data)
      const page2 = [{ id: 1000, created_at: '2024-01-01T02:00:00Z' }];
      enqueue(page2);

      const result = await getDeploymentReadings(1);
      expect(result).toHaveLength(1001);
      expect(mockSupabase!._chain.range).toHaveBeenCalledWith(0, 999);
      expect(mockSupabase!._chain.range).toHaveBeenCalledWith(1000, 1999);
    });

    it('returns empty array when deployment not found', async () => {
      enqueue(null); // getDeployment returns null
      expect(await getDeploymentReadings(999)).toEqual([]);
    });

    it('returns empty array when clamped start > end', async () => {
      enqueue(deployment);
      const result = await getDeploymentReadings(1, undefined, {
        start: '2024-01-03T00:00:00Z', // after deployment end
        end: '2024-01-04T00:00:00Z',
      });
      expect(result).toEqual([]);
    });

    it('returns empty array for invalid dates', async () => {
      enqueue(deployment);
      const result = await getDeploymentReadings(1, undefined, {
        start: 'not-a-date',
        end: '2024-01-02T00:00:00Z',
      });
      expect(result).toEqual([]);
    });

    it('returns empty array when supabase is null', async () => {
      mockSupabase = null;
      expect(await getDeploymentReadings(1)).toEqual([]);
    });

    it('returns empty array on query error with limit', async () => {
      enqueue(deployment);
      enqueue(null, { message: 'Error' });
      expect(await getDeploymentReadings(1, 100)).toEqual([]);
    });

    it('returns empty array on query error during pagination', async () => {
      enqueue(deployment);
      enqueue(null, { message: 'Error' });
      expect(await getDeploymentReadings(1)).toEqual([]);
    });
  });

  describe('getDistinctLocations', () => {
    it('returns deduplicated locations', async () => {
      enqueue([
        { location: 'Kitchen' },
        { location: 'Patio' },
        { location: 'Kitchen' },
      ]);
      const result = await getDistinctLocations();
      expect(result).toEqual(['Kitchen', 'Patio']);
    });

    it('returns empty array when supabase is null', async () => {
      mockSupabase = null;
      expect(await getDistinctLocations()).toEqual([]);
    });

    it('returns empty array on error', async () => {
      enqueue(null, { message: 'Error' });
      expect(await getDistinctLocations()).toEqual([]);
    });
  });
});
