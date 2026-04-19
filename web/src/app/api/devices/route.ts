import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin, enforceOrigin } from '@/lib/serverAuth';

const ID_RE = /^[a-z0-9_-]{1,32}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

type DevicePatch = {
  display_name?: string;
  color?: string;
  is_active?: boolean;
  monitor_enabled?: boolean;
  sort_order?: number;
};

function validateCreate(body: unknown): string | { id: string; display_name: string; color: string; sort_order: number } {
  if (!body || typeof body !== 'object') return 'Invalid body';
  const b = body as Record<string, unknown>;
  if (typeof b.id !== 'string' || !ID_RE.test(b.id)) return 'Invalid id';
  if (typeof b.display_name !== 'string' || !b.display_name.trim() || b.display_name.length > 64) return 'Invalid display_name';
  if (typeof b.color !== 'string' || !COLOR_RE.test(b.color)) return 'Invalid color';
  const sortOrderRaw = b.sort_order;
  const sort_order = typeof sortOrderRaw === 'number' && Number.isFinite(sortOrderRaw) ? Math.trunc(sortOrderRaw) : 0;
  return { id: b.id, display_name: b.display_name.trim(), color: b.color, sort_order };
}

function validatePatch(body: unknown): string | { id: string; patch: DevicePatch } {
  if (!body || typeof body !== 'object') return 'Invalid body';
  const b = body as Record<string, unknown>;
  if (typeof b.id !== 'string' || !ID_RE.test(b.id)) return 'Invalid id';
  const patch: DevicePatch = {};
  if ('display_name' in b) {
    if (typeof b.display_name !== 'string' || !b.display_name.trim() || b.display_name.length > 64) return 'Invalid display_name';
    patch.display_name = b.display_name.trim();
  }
  if ('color' in b) {
    if (typeof b.color !== 'string' || !COLOR_RE.test(b.color)) return 'Invalid color';
    patch.color = b.color;
  }
  if ('is_active' in b) {
    if (typeof b.is_active !== 'boolean') return 'Invalid is_active';
    patch.is_active = b.is_active;
  }
  if ('monitor_enabled' in b) {
    if (typeof b.monitor_enabled !== 'boolean') return 'Invalid monitor_enabled';
    patch.monitor_enabled = b.monitor_enabled;
  }
  if ('sort_order' in b) {
    if (typeof b.sort_order !== 'number' || !Number.isFinite(b.sort_order)) return 'Invalid sort_order';
    patch.sort_order = Math.trunc(b.sort_order);
  }
  if (Object.keys(patch).length === 0) return 'No updatable fields provided';
  return { id: b.id, patch };
}

export async function POST(request: NextRequest) {
  const originErr = enforceOrigin(request);
  if (originErr) return originErr;
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const validated = validateCreate(body);
  if (typeof validated === 'string') {
    return NextResponse.json({ error: validated }, { status: 400 });
  }

  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('devices')
    .insert(validated)
    .select()
    .single();

  if (error) {
    console.error('device insert failed:', error);
    return NextResponse.json({ error: 'Failed to create device' }, { status: 500 });
  }
  return NextResponse.json({ device: data });
}

export async function PATCH(request: NextRequest) {
  const originErr = enforceOrigin(request);
  if (originErr) return originErr;
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const body = await request.json().catch(() => null);
  const validated = validatePatch(body);
  if (typeof validated === 'string') {
    return NextResponse.json({ error: validated }, { status: 400 });
  }

  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('devices')
    .update(validated.patch)
    .eq('id', validated.id)
    .select()
    .single();

  if (error) {
    console.error('device update failed:', error);
    return NextResponse.json({ error: 'Failed to update device' }, { status: 500 });
  }
  return NextResponse.json({ device: data });
}

export async function DELETE(request: NextRequest) {
  const originErr = enforceOrigin(request);
  if (originErr) return originErr;
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id || !ID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const supabase = getServerClient();
  const { error } = await supabase.from('devices').delete().eq('id', id);
  if (error) {
    console.error('device delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete device' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
