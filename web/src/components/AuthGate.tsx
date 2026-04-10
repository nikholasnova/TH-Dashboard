'use client';

import { ReactNode } from 'react';
import Link from 'next/link';
import { useSession } from './AuthProvider';
import { useGuest } from '@/contexts/GuestContext';
import { LoadingSpinner } from './LoadingSpinner';

interface AuthGateProps {
  children: ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const { session, loading } = useSession();
  const { isGuest } = useGuest();

  if (isGuest) {
    return <>{children}</>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass-card p-8 text-center max-w-md">
          <h2 className="text-xl font-semibold text-[var(--foreground)] mb-4">
            Authentication Required
          </h2>
          <p className="text-[var(--foreground-muted)] mb-6">
            Please log in to view the dashboard.
          </p>
          <Link href="/login" className="btn-glass px-6 py-2 inline-block">
            Log In
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
