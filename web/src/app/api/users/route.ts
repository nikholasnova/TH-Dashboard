import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { requireAdmin, enforceOrigin } from '@/lib/serverAuth';
import { getPostHogClient } from '@/lib/posthog-server';

const USERS_PAGE_SIZE = 50;
const MAX_USERS_PAGE = 20;

async function recordRoleChange(
  supabase: ReturnType<typeof getServerClient>,
  actorId: string,
  targetId: string,
  oldRole: string | null,
  newRole: string,
  action: 'invite' | 'promote' | 'demote' | 'delete'
) {
  const { error } = await supabase.from('role_change_audit').insert({
    actor_id: actorId,
    target_id: targetId,
    old_role: oldRole,
    new_role: newRole,
    action,
  });
  if (error) console.error('role audit insert failed:', error);
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const pageParam = Number(searchParams.get('page') || '1');
  const page = Number.isFinite(pageParam) && pageParam >= 1
    ? Math.min(Math.trunc(pageParam), MAX_USERS_PAGE)
    : 1;

  const supabase = getServerClient();

  const [usersResult, rolesResult] = await Promise.all([
    supabase.auth.admin.listUsers({ page, perPage: USERS_PAGE_SIZE }),
    supabase.from('user_roles').select('user_id, role'),
  ]);

  if (usersResult.error) {
    console.error('listUsers failed:', usersResult.error);
    return NextResponse.json({ error: 'Failed to list users' }, { status: 500 });
  }

  const data = usersResult.data;
  const roles = rolesResult.data;

  const roleMap = new Map(
    (roles ?? []).map((r: { user_id: string; role: string }) => [r.user_id, r.role])
  );

  const users = data.users.map((u) => ({
    id: u.id,
    email: u.email,
    role: roleMap.get(u.id) ?? 'user',
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at,
  }));

  return NextResponse.json({ users, page, pageSize: USERS_PAGE_SIZE });
}

export async function POST(request: NextRequest) {
  const originErr = enforceOrigin(request);
  if (originErr) return originErr;
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const body = await request.json();
  const { email, linkOnly } = body;

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }

  const supabase = getServerClient();

  if (linkOnly) {
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'invite',
      email,
    });
    if (error) {
      console.error('generateLink failed:', error);
      return NextResponse.json({ error: 'Failed to generate invite link' }, { status: 400 });
    }

    if (data.user) {
      await supabase.from('user_roles').upsert({
        user_id: data.user.id,
        role: 'user',
      });
      await recordRoleChange(supabase, auth.user.id, data.user.id, null, 'user', 'invite');
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.headers.get('origin') || '';
    const redirectUrl = `${siteUrl}/login`;
    const inviteLink = `${data.properties.action_link}&redirect_to=${encodeURIComponent(redirectUrl)}`;

    const phClient = getPostHogClient();
    phClient?.capture({
      distinctId: auth.user.id,
      event: 'user_invited',
      properties: { invited_email: email, method: 'link' },
    });

    return NextResponse.json({ inviteLink });
  }

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);
  if (error) {
    console.error('inviteUserByEmail failed:', error);
    return NextResponse.json({ error: 'Failed to send invite' }, { status: 400 });
  }

  if (data.user) {
    await supabase.from('user_roles').upsert({
      user_id: data.user.id,
      role: 'user',
    });
    await recordRoleChange(supabase, auth.user.id, data.user.id, null, 'user', 'invite');
  }

  const phClient = getPostHogClient();
  phClient?.capture({
    distinctId: auth.user.id,
    event: 'user_invited',
    properties: { invited_email: email, method: 'email' },
  });

  return NextResponse.json({ user: data.user });
}

export async function PATCH(request: NextRequest) {
  const originErr = enforceOrigin(request);
  if (originErr) return originErr;
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const body = await request.json();
  const { userId, role } = body;

  if (!userId || !role || !['admin', 'user'].includes(role)) {
    return NextResponse.json(
      { error: 'userId and role (admin|user) are required' },
      { status: 400 }
    );
  }

  if (userId === auth.user.id) {
    return NextResponse.json(
      { error: 'Cannot change your own role' },
      { status: 400 }
    );
  }

  const supabase = getServerClient();

  const { data: existingRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  const oldRole = (existingRole?.role as string | undefined) ?? 'user';

  const { error: roleError } = await supabase
    .from('user_roles')
    .upsert({ user_id: userId, role });

  if (roleError) {
    console.error('role upsert failed:', roleError);
    return NextResponse.json({ error: 'Failed to update role' }, { status: 500 });
  }

  const action = role === oldRole ? 'promote' : (role === 'admin' ? 'promote' : 'demote');
  await recordRoleChange(supabase, auth.user.id, userId, oldRole, role, action);

  const phClient = getPostHogClient();
  phClient?.capture({
    distinctId: auth.user.id,
    event: 'user_role_changed',
    properties: { target_user_id: userId, new_role: role },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const originErr = enforceOrigin(request);
  if (originErr) return originErr;
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  if (userId === auth.user.id) {
    return NextResponse.json(
      { error: 'Cannot delete your own account' },
      { status: 400 }
    );
  }

  const supabase = getServerClient();

  const { data: existingRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  const oldRole = (existingRole?.role as string | undefined) ?? 'user';

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    console.error('deleteUser failed:', error);
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 });
  }

  await recordRoleChange(supabase, auth.user.id, userId, oldRole, 'deleted', 'delete');

  const phClient = getPostHogClient();
  phClient?.capture({
    distinctId: auth.user.id,
    event: 'user_removed',
    properties: { removed_user_id: userId },
  });

  return NextResponse.json({ success: true });
}
