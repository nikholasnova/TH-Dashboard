import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { getServerUser, requireAdmin, enforceOrigin } from '@/lib/serverAuth';
import { normalizeUsZipCode } from '@/lib/weatherZip';

const DEVICE_ID_RE = /^[a-z0-9_-]{1,32}$/;

type DeploymentInsert = {
  device_id: string;
  name: string;
  location: string;
  notes: string | null;
  zip_code: string | null;
  started_at: string;
};

type DeploymentPatch = {
  name?: string;
  location?: string;
  notes?: string | null;
  zip_code?: string | null;
  started_at?: string;
  ended_at?: string | null;
};

function isIso(v: unknown): v is string {
  return typeof v === 'string' && !Number.isNaN(new Date(v).getTime());
}

function validateCreate(body: unknown): string | DeploymentInsert {
  if (!body || typeof body !== 'object') return 'Invalid body';
  const b = body as Record<string, unknown>;
  if (typeof b.device_id !== 'string' || !DEVICE_ID_RE.test(b.device_id)) return 'Invalid device_id';
  if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 200) return 'Invalid name';
  if (typeof b.location !== 'string' || !b.location.trim() || b.location.length > 200) return 'Invalid location';
  const notes = typeof b.notes === 'string' ? b.notes.slice(0, 2000) : null;
  let zip_code: string | null = null;
  if (typeof b.zip_code === 'string' && b.zip_code.trim()) {
    const normalized = normalizeUsZipCode(b.zip_code);
    if (!normalized) return 'Invalid zip_code';
    zip_code = normalized;
  }
  const started_at = isIso(b.started_at) ? (b.started_at as string) : new Date().toISOString();
  return {
    device_id: b.device_id,
    name: b.name.trim(),
    location: b.location.trim(),
    notes,
    zip_code,
    started_at,
  };
}

function validatePatch(body: unknown): string | { id: number; patch: DeploymentPatch } {
  if (!body || typeof body !== 'object') return 'Invalid body';
  const b = body as Record<string, unknown>;
  const idNum = typeof b.id === 'number' ? b.id : Number(b.id);
  if (!Number.isFinite(idNum) || idNum <= 0) return 'Invalid id';
  const patch: DeploymentPatch = {};
  if ('name' in b) {
    if (typeof b.name !== 'string' || !b.name.trim() || b.name.length > 200) return 'Invalid name';
    patch.name = b.name.trim();
  }
  if ('location' in b) {
    if (typeof b.location !== 'string' || !b.location.trim() || b.location.length > 200) return 'Invalid location';
    patch.location = b.location.trim();
  }
  if ('notes' in b) {
    if (b.notes === null) patch.notes = null;
    else if (typeof b.notes === 'string') patch.notes = b.notes.slice(0, 2000);
    else return 'Invalid notes';
  }
  if ('zip_code' in b) {
    if (b.zip_code === null || b.zip_code === '') patch.zip_code = null;
    else if (typeof b.zip_code === 'string') {
      const normalized = normalizeUsZipCode(b.zip_code);
      if (!normalized) return 'Invalid zip_code';
      patch.zip_code = normalized;
    } else return 'Invalid zip_code';
  }
  if ('started_at' in b) {
    if (!isIso(b.started_at)) return 'Invalid started_at';
    patch.started_at = b.started_at as string;
  }
  if ('ended_at' in b) {
    if (b.ended_at === null) patch.ended_at = null;
    else if (isIso(b.ended_at)) patch.ended_at = b.ended_at as string;
    else return 'Invalid ended_at';
  }
  if (Object.keys(patch).length === 0) return 'No updatable fields provided';
  return { id: Math.trunc(idNum), patch };
}

async function getUserRole(
  supabase: ReturnType<typeof getServerClient>,
  userId: string,
): Promise<'admin' | 'user'> {
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('deployment role lookup failed:', error);
    return 'user';
  }
  return data?.role === 'admin' ? 'admin' : 'user';
}

export async function POST(request: NextRequest) {
  const originErr = enforceOrigin(request);
  if (originErr) return originErr;
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validated = validateCreate(body);
  if (typeof validated === 'string') {
    return NextResponse.json({ error: validated }, { status: 400 });
  }

  const supabase = getServerClient();
  const { data, error } = await supabase
    .from('deployments')
    .insert({ ...validated, owner_id: user.id })
    .select()
    .single();

  if (error) {
    console.error('deployment insert failed:', error);
    return NextResponse.json({ error: 'Failed to create deployment' }, { status: 500 });
  }
  return NextResponse.json({ deployment: data });
}

export async function PATCH(request: NextRequest) {
  const originErr = enforceOrigin(request);
  if (originErr) return originErr;
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const validated = validatePatch(body);
  if (typeof validated === 'string') {
    return NextResponse.json({ error: validated }, { status: 400 });
  }

  const supabase = getServerClient();
  const { data: existing, error: existingError } = await supabase
    .from('deployments')
    .select('owner_id')
    .eq('id', validated.id)
    .maybeSingle();

  if (existingError) {
    console.error('deployment owner lookup failed:', existingError);
    return NextResponse.json({ error: 'Failed to update deployment' }, { status: 500 });
  }
  if (!existing) {
    return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
  }

  if (existing.owner_id !== user.id) {
    const role = await getUserRole(supabase, user.id);
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from('deployments')
    .update(validated.patch)
    .eq('id', validated.id)
    .select()
    .single();

  if (error) {
    console.error('deployment update failed:', error);
    return NextResponse.json({ error: 'Failed to update deployment' }, { status: 500 });
  }
  return NextResponse.json({ deployment: data });
}

export async function DELETE(request: NextRequest) {
  const originErr = enforceOrigin(request);
  if (originErr) return originErr;
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const idRaw = searchParams.get('id');
  const id = idRaw ? Number(idRaw) : NaN;
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const supabase = getServerClient();
  const { error } = await supabase.rpc('delete_deployment_cascade', {
    p_deployment_id: Math.trunc(id),
  });
  if (error) {
    console.error('deployment delete failed:', error);
    return NextResponse.json({ error: 'Failed to delete deployment' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
