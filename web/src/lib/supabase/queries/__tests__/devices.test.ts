import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let mockSupabase: ReturnType<typeof createMockSupabase> | null;

function createMockChain(resolveWith: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const handler = () => chain;
  for (const m of ['select', 'insert', 'update', 'delete', 'eq', 'order', 'single', 'maybeSingle', 'limit']) {
    chain[m] = vi.fn(handler);
  }
  chain.then = (resolve: (v: unknown) => void) => resolve(resolveWith);
  return chain;
}

function createMockSupabase() {
  const chain = createMockChain({ data: null, error: null });
  return { from: vi.fn(() => chain), _chain: chain };
}

vi.mock('../../client', () => ({
  get supabase() {
    return mockSupabase;
  },
}));

import { getDevices, createDevice, updateDevice, deactivateDevice } from '../devices';

describe('devices queries', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(response: { ok: boolean; status?: number; json: () => unknown }) {
    const wrapped = {
      ok: response.ok,
      status: response.status ?? (response.ok ? 200 : 500),
      json: async () => response.json(),
    };
    const spy = vi.fn(async () => wrapped as unknown as Response);
    globalThis.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  describe('getDevices', () => {
    it('returns devices with activeOnly=true by default', async () => {
      const devices = [{ id: 'node1', display_name: 'Node 1' }];
      mockSupabase!._chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: devices, error: null });

      const result = await getDevices();
      expect(result).toEqual(devices);
      expect(mockSupabase!.from).toHaveBeenCalledWith('devices');
      expect(mockSupabase!._chain.eq).toHaveBeenCalledWith('is_active', true);
    });

    it('skips is_active filter when activeOnly=false', async () => {
      const devices = [{ id: 'node1' }, { id: 'node2' }];
      mockSupabase!._chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: devices, error: null });

      const result = await getDevices(false);
      expect(result).toEqual(devices);
      expect(mockSupabase!._chain.eq).not.toHaveBeenCalledWith('is_active', true);
    });

    it('returns empty array when supabase is null', async () => {
      mockSupabase = null;
      const result = await getDevices();
      expect(result).toEqual([]);
    });

    it('throws on error', async () => {
      const error = { message: 'DB error' };
      mockSupabase!._chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error });

      await expect(getDevices()).rejects.toEqual(error);
    });
  });

  describe('createDevice', () => {
    it('POSTs to /api/devices and returns the device', async () => {
      const device = { id: 'node3', display_name: 'Node 3', color: '#ff0000' };
      const spy = mockFetch({ ok: true, json: () => ({ device }) });

      const result = await createDevice(device);
      expect(result).toEqual(device);
      expect(spy).toHaveBeenCalledWith('/api/devices', expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(device),
      }));
    });

    it('throws with server error message when the POST fails', async () => {
      mockFetch({ ok: false, status: 400, json: () => ({ error: 'Duplicate key' }) });

      await expect(
        createDevice({ id: 'x', display_name: 'X', color: '#000000' })
      ).rejects.toThrow('Duplicate key');
    });

    it('throws a generic error when server returns no body', async () => {
      mockFetch({ ok: false, status: 500, json: () => { throw new Error('no body'); } });

      await expect(
        createDevice({ id: 'x', display_name: 'X', color: '#000000' })
      ).rejects.toThrow('Failed to create device');
    });
  });

  describe('updateDevice', () => {
    it('PATCHes /api/devices with id and updates and returns the device', async () => {
      const updated = { id: 'node1', display_name: 'Updated' };
      const spy = mockFetch({ ok: true, json: () => ({ device: updated }) });

      const result = await updateDevice('node1', { display_name: 'Updated' });
      expect(result).toEqual(updated);
      expect(spy).toHaveBeenCalledWith('/api/devices', expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ id: 'node1', display_name: 'Updated' }),
      }));
    });

    it('throws on error', async () => {
      mockFetch({ ok: false, status: 404, json: () => ({ error: 'Not found' }) });
      await expect(updateDevice('node1', { display_name: 'X' })).rejects.toThrow('Not found');
    });
  });

  describe('deactivateDevice', () => {
    it('returns true on success', async () => {
      mockFetch({ ok: true, json: () => ({ device: { id: 'node1' } }) });
      const result = await deactivateDevice('node1');
      expect(result).toBe(true);
    });

    it('returns false on error', async () => {
      mockFetch({ ok: false, status: 500, json: () => ({ error: 'Error' }) });
      const result = await deactivateDevice('node1');
      expect(result).toBe(false);
    });
  });
});
