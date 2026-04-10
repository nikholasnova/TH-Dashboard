'use client';

import posthog from 'posthog-js';
import { PostHogProvider as PHProvider, usePostHog } from 'posthog-js/react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef, Suspense } from 'react';
import { useSession } from './AuthProvider';

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

if (typeof window !== 'undefined' && POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: 'https://us.posthog.com',
    capture_pageview: false, // we handle this manually for App Router
    capture_pageleave: true,
    autocapture: true,
    session_recording: {
      maskAllInputs: false,
      maskInputOptions: { password: true },
    },
  });
}

function PostHogPageViewInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!POSTHOG_KEY) return;
    const url = window.origin + pathname;
    const search = searchParams.toString();
    posthog.capture('$pageview', {
      $current_url: search ? `${url}?${search}` : url,
    });
  }, [pathname, searchParams]);

  return null;
}

export function PostHogPageView() {
  return (
    <Suspense fallback={null}>
      <PostHogPageViewInner />
    </Suspense>
  );
}

function PostHogIdentify() {
  const { user } = useSession();
  const ph = usePostHog();
  const prevUserId = useRef<string | null>(null);

  useEffect(() => {
    if (!ph || !POSTHOG_KEY) return;

    if (user && user.id !== prevUserId.current) {
      ph.identify(user.id, {
        email: user.email,
        role: user.app_metadata?.role,
      });
      prevUserId.current = user.id;
    } else if (!user && prevUserId.current) {
      ph.reset();
      prevUserId.current = null;
    }
  }, [user, ph]);

  return null;
}

export function PostHogProviderWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!POSTHOG_KEY) {
    return <>{children}</>;
  }

  return (
    <PHProvider client={posthog}>
      <PostHogPageView />
      <PostHogIdentify />
      {children}
    </PHProvider>
  );
}
