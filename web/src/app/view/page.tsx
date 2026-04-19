'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function ViewPageInner() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [error, setError] = useState(() => (token ? '' : 'No token provided.'));

  useEffect(() => {
    if (!token) return;

    fetch('/api/guest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((res) => {
        if (!res.ok) throw new Error('Invalid or expired link.');
        window.location.href = '/';
      })
      .catch(() => setError('Invalid or expired link.'));
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card p-8 text-center max-w-md">
          <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">
            Access Denied
          </h2>
          <p className="text-sm text-[var(--foreground-muted)]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-sm text-[var(--foreground-muted)]">Verifying access...</p>
    </div>
  );
}

export default function ViewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><p className="text-sm text-[var(--foreground-muted)]">Loading...</p></div>}>
      <ViewPageInner />
    </Suspense>
  );
}
