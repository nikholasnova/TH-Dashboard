import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';

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
  if (!expected || provided !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
  const role = user.app_metadata?.role ?? 'user';
  if (role !== 'admin') {
    return {
      user: null,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }
  return { user, response: null };
}

export function getClientIp(source: Headers | NextRequest): string {
  const h = source instanceof Headers ? source : source.headers;
  return (
    h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    h.get('x-real-ip') ||
    'unknown'
  );
}

export function createRateLimiter(opts: { windowMs: number }) {
  const map = new Map<string, number[]>();
  return function checkLimit(key: string, max: number): boolean {
    const now = Date.now();
    const timestamps = (map.get(key) || []).filter(
      (t) => now - t < opts.windowMs
    );
    if (timestamps.length === 0) map.delete(key);
    if (timestamps.length >= max) return false;
    timestamps.push(now);
    map.set(key, timestamps);
    return true;
  };
}
