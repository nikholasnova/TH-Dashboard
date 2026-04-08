import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = createMockSupabase();
  });

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

    it('returns empty array when data is null', async () => {
      mockSupabase!._chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null });

      const result = await getDevices();
      expect(result).toEqual([]);
    });

    it('applies sort_order and created_at ordering', async () => {
      mockSupabase!._chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [], error: null });

      await getDevices();
      expect(mockSupabase!._chain.order).toHaveBeenCalledWith('sort_order', { ascending: true });
      expect(mockSupabase!._chain.order).toHaveBeenCalledWith('created_at', { ascending: true });
    });
  });

  describe('createDevice', () => {
    it('creates a device and returns it', async () => {
      const device = { id: 'node3', display_name: 'Node 3', color: '#ff0000' };
      mockSupabase!._chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: device, error: null });

      const result = await createDevice(device);
      expect(result).toEqual(device);
      expect(mockSupabase!.from).toHaveBeenCalledWith('devices');
      expect(mockSupabase!._chain.insert).toHaveBeenCalledWith(device);
      expect(mockSupabase!._chain.single).toHaveBeenCalled();
    });

    it('returns null when supabase is null', async () => {
      mockSupabase = null;
      const result = await createDevice({ id: 'x', display_name: 'X', color: '#000' });
      expect(result).toBeNull();
    });

    it('throws on error', async () => {
      const error = { message: 'Duplicate key' };
      mockSupabase!._chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error });

      await expect(createDevice({ id: 'x', display_name: 'X', color: '#000' })).rejects.toEqual(error);
    });
  });

  describe('updateDevice', () => {
    it('updates and returns the device', async () => {
      const updated = { id: 'node1', display_name: 'Updated' };
      mockSupabase!._chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: updated, error: null });

      const result = await updateDevice('node1', { display_name: 'Updated' });
      expect(result).toEqual(updated);
      expect(mockSupabase!._chain.update).toHaveBeenCalledWith({ display_name: 'Updated' });
      expect(mockSupabase!._chain.eq).toHaveBeenCalledWith('id', 'node1');
      expect(mockSupabase!._chain.single).toHaveBeenCalled();
    });

    it('returns null when supabase is null', async () => {
      mockSupabase = null;
      const result = await updateDevice('node1', { display_name: 'X' });
      expect(result).toBeNull();
    });

    it('throws on error', async () => {
      const error = { message: 'Not found' };
      mockSupabase!._chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error });

      await expect(updateDevice('node1', { display_name: 'X' })).rejects.toEqual(error);
    });
  });

  describe('deactivateDevice', () => {
    it('returns true on success', async () => {
      mockSupabase!._chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: null });

      const result = await deactivateDevice('node1');
      expect(result).toBe(true);
      expect(mockSupabase!._chain.update).toHaveBeenCalledWith({ is_active: false });
      expect(mockSupabase!._chain.eq).toHaveBeenCalledWith('id', 'node1');
    });

    it('returns false when supabase is null', async () => {
      mockSupabase = null;
      const result = await deactivateDevice('node1');
      expect(result).toBe(false);
    });

    it('returns false on error', async () => {
      mockSupabase!._chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: null, error: { message: 'Error' } });

      const result = await deactivateDevice('node1');
      expect(result).toBe(false);
    });
  });
});
