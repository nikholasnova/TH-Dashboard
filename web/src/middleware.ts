import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';

// CSP for the dashboard. 'unsafe-inline' on script-src is required because
// Next.js statically prerenders some pages and bakes inline RSC streaming
// scripts into the HTML — those inline scripts cannot receive a per-request
// nonce, and 'strict-dynamic' would override any host allowlist while
// blocking them. A proper nonce-based CSP requires forcing every page into
// dynamic rendering and reading headers() in the root layout; tracked as a
// follow-up. 'unsafe-eval' is dev-only for React's callstack reconstruction.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'wasm-unsafe-eval' 'unsafe-inline'${
    process.env.NODE_ENV === 'production' ? '' : " 'unsafe-eval'"
  } https://cdn.jsdelivr.net https://us-assets.i.posthog.com https://novachuk.dev`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.supabase.co https://us.i.posthog.com https://us-assets.i.posthog.com https://cdn.jsdelivr.net https://novachuk.dev",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://www.overleaf.com",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join('; ');

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  supabaseResponse.headers.set('content-security-policy', CSP);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          supabaseResponse.headers.set('content-security-policy', CSP);
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const redirect = NextResponse.redirect(url);
    redirect.headers.set('content-security-policy', CSP);
    return redirect;
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
