import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockSupabase: ReturnType<typeof createMockSupabase> | null;

function createMockChain(resolveWith: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const handler = () => chain;
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'single', 'maybeSingle', 'range']) {
    chain[m] = vi.fn(handler);
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(resolveWith);
  return chain;
}

function createMockSupabase(resolveWith = { data: null, error: null }) {
  const chain = createMockChain(resolveWith);
  return {
    from: vi.fn(() => chain),
    rpc: vi.fn(() => chain),
    _chain: chain,
    _setResult(data: unknown, error: unknown = null) {
      chain.then = (resolve: (v: unknown) => void) => resolve({ data, error });
    },
  };
}

vi.mock('../../client', () => ({
  get supabase() {
    return mockSupabase;
  },
}));

import {
  getDashboardLive,
  getLatestReading,
  getAllReadingsRange,
  getChartSamples,
  getDeviceStats,
} from '../readings';

describe('readings queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

  describe('getDashboardLive', () => {
    it('returns structured data for sensor, weather, and sparkline rows', async () => {
      mockSupabase!._setResult([
        { row_type: 'sensor', id: 1, device_id: 'node1', temperature: 20, humidity: 45, created_at: '2024-01-01', source: 'sensor' },
        { row_type: 'weather', id: 2, device_id: 'weather_node1', temperature: 21, humidity: 50, created_at: '2024-01-01', source: 'weather' },
        { row_type: 'sparkline', device_id: 'node1', bucket_ts: '2024-01-01', temperature_avg: 20, humidity_avg: 45, reading_count: 12 },
      ]);

      const result = await getDashboardLive(['node1'], '2024-01-01T00:00:00Z');

      expect(result.sensor.node1).toBeTruthy();
      expect(result.sensor.node1!.temperature).toBe(20);
      expect(result.weather.node1).toBeTruthy();
      expect(result.weather.node1!.device_id).toBe('weather_node1');
      expect(result.sparklines.node1).toHaveLength(1);
      expect(mockSupabase!.rpc).toHaveBeenCalledWith('get_dashboard_live', expect.objectContaining({
        p_device_ids: ['node1'],
      }));
    });

    it('returns empty structure when deviceIds is empty', async () => {
      const result = await getDashboardLive([], '2024-01-01T00:00:00Z');
      expect(result).toEqual({ sensor: {}, weather: {}, sparklines: {} });
    });

    it('returns empty structure when supabase is null', async () => {
      mockSupabase = null;
      const result = await getDashboardLive(['node1'], '2024-01-01T00:00:00Z');
      expect(result).toEqual({ sensor: {}, weather: {}, sparklines: {} });
    });

    it('returns empty structure on error', async () => {
      mockSupabase!._setResult(null, { message: 'RPC error' });
      const result = await getDashboardLive(['node1'], '2024-01-01T00:00:00Z');
      expect(result).toEqual({ sensor: {}, weather: {}, sparklines: {} });
    });

    it('handles null data gracefully', async () => {
      mockSupabase!._setResult(null);
      const result = await getDashboardLive(['node1'], '2024-01-01T00:00:00Z');
      expect(result.sensor.node1).toBeNull();
      expect(result.sparklines.node1).toEqual([]);
    });
  });

  describe('getLatestReading', () => {
    it('returns the latest reading', async () => {
      const reading = { id: 1, device_id: 'node1', temperature: 22, humidity: 50, created_at: '2024-01-01' };
      mockSupabase!._setResult(reading);

      const result = await getLatestReading('node1');
      expect(result).toEqual(reading);
      expect(mockSupabase!.from).toHaveBeenCalledWith('readings');
      expect(mockSupabase!._chain.eq).toHaveBeenCalledWith('device_id', 'node1');
      expect(mockSupabase!._chain.maybeSingle).toHaveBeenCalled();
    });

    it('returns null when supabase is null', async () => {
      mockSupabase = null;
      expect(await getLatestReading('node1')).toBeNull();
    });

    it('returns null on error', async () => {
      mockSupabase!._setResult(null, { message: 'Error' });
      expect(await getLatestReading('node1')).toBeNull();
    });
  });

  describe('getAllReadingsRange', () => {
    it('returns readings in range', async () => {
      const readings = [{ id: 1 }];
      mockSupabase!._setResult(readings);

      const result = await getAllReadingsRange({ start: '2024-01-01', end: '2024-01-02' });
      expect(result).toEqual(readings);
      expect(mockSupabase!._chain.gte).toHaveBeenCalledWith('created_at', '2024-01-01');
      expect(mockSupabase!._chain.lte).toHaveBeenCalledWith('created_at', '2024-01-02');
    });

    it('applies device_id filter when provided', async () => {
      mockSupabase!._setResult([]);
      await getAllReadingsRange({ start: '2024-01-01', end: '2024-01-02', device_id: 'node1' });
      expect(mockSupabase!._chain.eq).toHaveBeenCalledWith('device_id', 'node1');
    });

    it('skips device_id filter when omitted', async () => {
      mockSupabase!._setResult([]);
      await getAllReadingsRange({ start: '2024-01-01', end: '2024-01-02' });
      expect(mockSupabase!._chain.eq).not.toHaveBeenCalled();
    });

    it('applies maxRows limit', async () => {
      mockSupabase!._setResult([]);
      await getAllReadingsRange({ start: '2024-01-01', end: '2024-01-02', maxRows: 1000 });
      expect(mockSupabase!._chain.limit).toHaveBeenCalledWith(1000);
    });

    it('returns empty array when supabase is null', async () => {
      mockSupabase = null;
      expect(await getAllReadingsRange({ start: '2024-01-01', end: '2024-01-02' })).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mockSupabase!._setResult(null, { message: 'Error' });
      expect(await getAllReadingsRange({ start: '2024-01-01', end: '2024-01-02' })).toEqual([]);
    });
  });

  describe('getChartSamples', () => {
    it('calls rpc with correct bucket minutes', async () => {
      mockSupabase!._setResult([]);
      await getChartSamples({ start: '2024-01-01', end: '2024-01-02', bucketSeconds: 180 });
      expect(mockSupabase!.rpc).toHaveBeenCalledWith('get_chart_samples', expect.objectContaining({
        p_bucket_minutes: 3,
      }));
    });

    it('enforces minimum bucket of 1 minute', async () => {
      mockSupabase!._setResult([]);
      await getChartSamples({ start: '2024-01-01', end: '2024-01-02', bucketSeconds: 10 });
      expect(mockSupabase!.rpc).toHaveBeenCalledWith('get_chart_samples', expect.objectContaining({
        p_bucket_minutes: 1,
      }));
    });

    it('passes null for missing device_id', async () => {
      mockSupabase!._setResult([]);
      await getChartSamples({ start: '2024-01-01', end: '2024-01-02', bucketSeconds: 60 });
      expect(mockSupabase!.rpc).toHaveBeenCalledWith('get_chart_samples', expect.objectContaining({
        p_device_id: null,
      }));
    });

    it('applies maxRows limit', async () => {
      mockSupabase!._setResult([]);
      await getChartSamples({ start: '2024-01-01', end: '2024-01-02', bucketSeconds: 60, maxRows: 500 });
      expect(mockSupabase!._chain.limit).toHaveBeenCalledWith(500);
    });

    it('returns empty array when supabase is null', async () => {
      mockSupabase = null;
      expect(await getChartSamples({ start: '2024-01-01', end: '2024-01-02', bucketSeconds: 60 })).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mockSupabase!._setResult(null, { message: 'Error' });
      expect(await getChartSamples({ start: '2024-01-01', end: '2024-01-02', bucketSeconds: 60 })).toEqual([]);
    });
  });

  describe('getDeviceStats', () => {
    it('returns stats via rpc', async () => {
      const stats = [{ device_id: 'node1', temp_avg: 22 }];
      mockSupabase!._setResult(stats);

      const result = await getDeviceStats({ start: '2024-01-01', end: '2024-01-02' });
      expect(result).toEqual(stats);
      expect(mockSupabase!.rpc).toHaveBeenCalledWith('get_device_stats', expect.objectContaining({
        p_device_id: null,
      }));
    });

    it('passes device_id when provided', async () => {
      mockSupabase!._setResult([]);
      await getDeviceStats({ start: '2024-01-01', end: '2024-01-02', device_id: 'node1' });
      expect(mockSupabase!.rpc).toHaveBeenCalledWith('get_device_stats', expect.objectContaining({
        p_device_id: 'node1',
      }));
    });

    it('returns empty array when supabase is null', async () => {
      mockSupabase = null;
      expect(await getDeviceStats({ start: '2024-01-01', end: '2024-01-02' })).toEqual([]);
    });

    it('returns empty array on error', async () => {
      mockSupabase!._setResult(null, { message: 'Error' });
      expect(await getDeviceStats({ start: '2024-01-01', end: '2024-01-02' })).toEqual([]);
    });
  });
});
