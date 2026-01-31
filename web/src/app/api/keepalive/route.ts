import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Use service role key to bypass RLS (this is a server-only route with secret protection)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

// Pinged by Vercel cron to keep Supabase project active
// Protected by CRON_SECRET - only Vercel Cron can call this
export async function GET(request: NextRequest) {
  // Validate CRON_SECRET from Authorization header or query param
  const authHeader = request.headers.get('authorization');
  const { searchParams } = new URL(request.url);
  const querySecret = searchParams.get('secret');

  const expectedSecret = process.env.CRON_SECRET;
  const providedSecret = authHeader?.replace('Bearer ', '') || querySecret;

  if (!expectedSecret || providedSecret !== expectedSecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { count, error } = await supabase
    .from('readings')
    .select('*', { count: 'exact', head: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, readings: count, timestamp: new Date().toISOString() });
}
