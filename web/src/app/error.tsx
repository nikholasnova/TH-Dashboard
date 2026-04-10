'use client';

import { useEffect } from 'react';
import { usePostHog } from 'posthog-js/react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const posthog = usePostHog();

  useEffect(() => {
    console.error(error);
    posthog?.capture('$exception', {
      $exception_message: error.message,
      $exception_stack: error.stack,
      $exception_digest: error.digest,
    });
  }, [error, posthog]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-card p-8 text-center max-w-md">
        <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">Something went wrong</h2>
        <p className="text-sm text-[var(--foreground-muted)] mb-6">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="btn-glass px-6 py-2"
          >
            Try again
          </button>
          <Link href="/" className="btn-glass px-6 py-2 no-underline text-[var(--foreground)]">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

