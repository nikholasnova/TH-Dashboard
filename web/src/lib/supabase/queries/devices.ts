import { supabase } from '../client';
import type { Device, DeviceAlertState } from '../types';

export async function getDevices(activeOnly = true): Promise<Device[]> {
  if (!supabase) return [];
  let query = supabase
    .from('devices')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function createDevice(device: {
  id: string;
  display_name: string;
  color: string;
  sort_order?: number;
}): Promise<Device | null> {
  const res = await fetch('/api/devices', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(device),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to create device (${res.status})`);
  }
  const { device: created } = await res.json();
  return created ?? null;
}

export async function updateDevice(
  id: string,
  updates: Partial<Pick<Device, 'display_name' | 'color' | 'is_active' | 'monitor_enabled' | 'sort_order'>>
): Promise<Device | null> {
  const res = await fetch('/api/devices', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id, ...updates }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Failed to update device (${res.status})`);
  }
  const { device } = await res.json();
  return device ?? null;
}

export async function getDeviceAlertStates(deviceIds: string[]): Promise<DeviceAlertState[]> {
  if (!supabase || deviceIds.length === 0) return [];
  const { data, error } = await supabase
    .from('device_alert_state')
    .select('device_id, status, last_seen_at, last_alert_type, last_alert_sent_at, last_recovery_sent_at, updated_at')
    .in('device_id', deviceIds);
  if (error) {
    console.error('Error fetching device alert states:', error);
    return [];
  }
  return data || [];
}

export async function deactivateDevice(id: string): Promise<boolean> {
  try {
    await updateDevice(id, { is_active: false });
    return true;
  } catch (err) {
    console.error('Error deactivating device:', err);
    return false;
  }
}
