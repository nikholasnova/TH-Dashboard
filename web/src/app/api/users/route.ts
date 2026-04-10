import { NextRequest, NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server';
import { getServerUser } from '@/lib/serverAuth';
import { getPostHogClient } from '@/lib/posthog-server';

async function requireAdmin() {
  const user = await getServerUser();
  if (!user) {
    return { error: 'Unauthorized', status: 401, user: null };
  }
  const role = user.app_metadata?.role ?? 'user';
  if (role !== 'admin') {
    return { error: 'Forbidden', status: 403, user: null };
  }
  return { error: null, status: 200, user };
}

export async function GET() {
  const auth = await requireAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = getServerClient();

  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: roles } = await supabase
    .from('user_roles')
    .select('user_id, role');

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

  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

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
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (data.user) {
      await supabase.from('user_roles').upsert({
        user_id: data.user.id,
        role: 'user',
      });
    }

    // Build the redirect URL that the user would normally get via email
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || request.headers.get('origin') || '';
    const redirectUrl = `${siteUrl}/login`;
    const inviteLink = `${data.properties.action_link}&redirect_to=${encodeURIComponent(redirectUrl)}`;

    const phClient = getPostHogClient();
    phClient?.capture({
      distinctId: auth.user!.id,
      event: 'user_invited',
      properties: { invited_email: email, method: 'link' },
    });

    return NextResponse.json({ inviteLink });
  }

  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (data.user) {
    await supabase.from('user_roles').upsert({
      user_id: data.user.id,
      role: 'user',
    });
  }

  const phClient = getPostHogClient();
  phClient?.capture({
    distinctId: auth.user!.id,
    event: 'user_invited',
    properties: { invited_email: email, method: 'email' },
  });

  return NextResponse.json({ user: data.user });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json();
  const { userId, role } = body;

  if (!userId || !role || !['admin', 'user'].includes(role)) {
    return NextResponse.json(
      { error: 'userId and role (admin|user) are required' },
      { status: 400 }
    );
  }

  if (userId === auth.user!.id) {
    return NextResponse.json(
      { error: 'Cannot change your own role' },
      { status: 400 }
    );
  }

  const supabase = getServerClient();

  const { error: roleError } = await supabase
    .from('user_roles')
    .upsert({ user_id: userId, role });

  if (roleError) {
    return NextResponse.json({ error: roleError.message }, { status: 500 });
  }

  const { error: metaError } = await supabase.auth.admin.updateUserById(
    userId,
    { app_metadata: { role } }
  );

  if (metaError) {
    return NextResponse.json({ error: metaError.message }, { status: 500 });
  }

  const phClient = getPostHogClient();
  phClient?.capture({
    distinctId: auth.user!.id,
    event: 'user_role_changed',
    properties: { target_user_id: userId, new_role: role },
  });

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.error) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  if (userId === auth.user!.id) {
    return NextResponse.json(
      { error: 'Cannot delete your own account' },
      { status: 400 }
    );
  }

  const supabase = getServerClient();

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const phClient = getPostHogClient();
  phClient?.capture({
    distinctId: auth.user!.id,
    event: 'user_removed',
    properties: { removed_user_id: userId },
  });

  return NextResponse.json({ success: true });
}
