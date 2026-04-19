import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, getClientIp, enforceOrigin } from '@/lib/serverAuth';
import { guestTokenLimiter } from '@/lib/rateLimiter';
import { timingSafeCompare } from '@/lib/secrets';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth.response) return auth.response;

  const token = process.env.GUEST_VIEW_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'GUEST_VIEW_TOKEN is not configured' },
      { status: 404 }
    );
  }

  const host = request.headers.get('host') || '';
  const proto = request.headers.get('x-forwarded-proto') || 'https';
  const origin = process.env.NEXT_PUBLIC_SITE_URL || `${proto}://${host}`;
  const link = `${origin}/view?token=${encodeURIComponent(token)}`;
  return NextResponse.json({ link });
}

export async function POST(request: NextRequest) {
  const originErr = enforceOrigin(request);
  if (originErr) return originErr;

  const ip = getClientIp(request);
  const { success } = await guestTokenLimiter.limit(ip);
  if (!success) {
    return NextResponse.json({ error: 'Too many attempts' }, { status: 429 });
  }

  const { token } = await request.json().catch(() => ({ token: null }));
  const validToken = process.env.GUEST_VIEW_TOKEN;

  if (!validToken || typeof token !== 'string' || !timingSafeCompare(validToken, token)) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  }

  const response = NextResponse.json({ success: true });
  const cookieOpts = {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
  };
  response.cookies.set('guest_token', token, { ...cookieOpts, httpOnly: true });
  response.cookies.set('guest_mode', '1', cookieOpts);

  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ success: true });
  const clearOpts = {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    path: '/',
    maxAge: 0,
  };
  response.cookies.set('guest_token', '', { ...clearOpts, httpOnly: true });
  response.cookies.set('guest_mode', '', clearOpts);
  return response;
}
