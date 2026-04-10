import { NextRequest, NextResponse } from 'next/server';
import { getServerUser } from '@/lib/serverAuth';

export async function GET(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const role = user.app_metadata?.role ?? 'user';
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const token = process.env.GUEST_VIEW_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'GUEST_VIEW_TOKEN is not configured' },
      { status: 404 }
    );
  }

  const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || '';
  const link = `${origin}/view?token=${encodeURIComponent(token)}`;
  return NextResponse.json({ link });
}

export async function POST(request: NextRequest) {
  const { token } = await request.json();
  const validToken = process.env.GUEST_VIEW_TOKEN;

  if (!validToken || !token || token !== validToken) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set('guest_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  return response;
}
