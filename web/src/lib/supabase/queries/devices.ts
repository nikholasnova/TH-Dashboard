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
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('devices')
    .insert(device)
    .select()
    .single();
  if (error) {
    console.error('Error creating device:', error);
    throw error;
  }
  return data;
}

export async function updateDevice(
  id: string,
  updates: Partial<Pick<Device, 'display_name' | 'color' | 'is_active' | 'monitor_enabled' | 'sort_order'>>
): Promise<Device | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('devices')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    console.error('Error updating device:', error);
    throw error;
  }
  return data;
}

export async function getDeviceAlertStates(deviceIds: string[]): Promise<DeviceAlertState[]> {
  if (!supabase || deviceIds.length === 0) return [];
  const { data, error } = await supabase
    .from('device_alert_state')
    .select('device_id, status, last_seen_at, updated_at')
    .in('device_id', deviceIds);
  if (error) {
    console.error('Error fetching device alert states:', error);
    return [];
  }
  return data || [];
}

export async function deactivateDevice(id: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase
    .from('devices')
    .update({ is_active: false })
    .eq('id', id);
  if (error) {
    console.error('Error deactivating device:', error);
    return false;
  }
  return true;
}
