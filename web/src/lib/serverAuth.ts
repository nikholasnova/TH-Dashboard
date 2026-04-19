import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { timingSafeCompare } from './secrets';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  );
}

export async function getServerUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getServerUser();
  return user !== null;
}

export function getServiceRoleClient():
  | { client: SupabaseClient; error: null }
  | { client: null; error: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return {
      client: null,
      error:
        'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required',
    };
  }

  return { client: createClient(url, serviceRoleKey), error: null };
}

export function verifyCronSecret(request: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  const provided = request.headers.get('authorization')?.replace('Bearer ', '');
  if (!timingSafeCompare(expected, provided)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  // Defense-in-depth on Vercel: require the Vercel cron user-agent.
  if (process.env.VERCEL === '1') {
    const ua = request.headers.get('user-agent') || '';
    if (!ua.includes('vercel-cron')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }
  return null;
}

export async function requireAdmin(): Promise<
  { user: User; response: null } | { user: null; response: NextResponse }
> {
  const user = await getServerUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  const { client: supabase } = getServiceRoleClient();
  if (!supabase) {
    return {
      user: null,
      response: NextResponse.json({ error: 'Server misconfigured' }, { status: 500 }),
    };
  }
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    console.error('role lookup failed:', error);
    return {
      user: null,
      response: NextResponse.json({ error: 'Server error' }, { status: 500 }),
    };
  }
  if (data?.role !== 'admin') {
    return {
      user: null,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { user, response: null };
}

export function getClientIp(source: Headers | NextRequest): string {
  const h = source instanceof Headers ? source : source.headers;
  const vercelIp = h.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (vercelIp) return vercelIp;
  if (process.env.VERCEL !== '1') {
    return (
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      h.get('x-real-ip') ||
      'unknown'
    );
  }
  return 'unknown';
}

export function enforceOrigin(req: Request | NextRequest): NextResponse | null {
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return null;
  // Only enforce in production. Dev and test environments may make
  // requests without an Origin header (curl, fetch from tests).
  if (process.env.NODE_ENV !== 'production') return null;
  const origin = req.headers.get('origin');
  const allowed = [process.env.NEXT_PUBLIC_SITE_URL].filter(
    (x): x is string => Boolean(x)
  );
  if (!origin || !allowed.includes(origin)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

