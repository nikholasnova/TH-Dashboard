'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { signIn } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/components/AuthProvider';
import { useEffect } from 'react';
import posthog from 'posthog-js';

export default function LoginPage() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInvite] = useState(() => {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash;
    return hash.includes('type=invite') || hash.includes('type=recovery');
  });
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSet, setPasswordSet] = useState(false);

  // When landing with an invite hash, the Supabase singleton may have
  // already initialized before the hash appeared in the URL. Manually
  // extract the tokens and establish the session.
  useEffect(() => {
    if (!isInvite || !supabase) return;
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    }
  }, [isInvite]);

  useEffect(() => {
    if (!loading && session && !isInvite) {
      router.push('/');
    }
  }, [session, loading, router, isInvite]);

  const handleSetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    const { error: updateError } = await supabase!.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      setError(updateError.message);
      setIsSubmitting(false);
    } else {
      setPasswordSet(true);
      posthog.capture('user_accepted_invite');
      setTimeout(() => router.push('/'), 1500);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const result = await signIn(email, password);

    if (result.success) {
      posthog.capture('user_signed_in', { method: 'email' });
      router.push('/');
    } else {
      posthog.capture('user_sign_in_failed', { error: result.error || 'Invalid credentials' });
      setError(result.error || 'Invalid credentials');
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-card p-8">
          <p className="text-[var(--foreground-muted)]">Loading...</p>
        </div>
      </div>
    );
  }

  if (session && !isInvite) {
    return null;
  }

  if (isInvite) {
    const sessionReady = !loading && !!session;

    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 50% 40% at 50% 50%, rgba(148, 163, 184, 0.08) 0%, transparent 70%)',
          }}
        />
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
          className="glass-card p-8 w-full max-w-md relative"
          style={{ background: 'var(--glass-bg)' }}
        >
          <div className="mb-8 text-center">
            <div className="flex justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-[var(--foreground-muted)]">
                <rect x="13" y="4" width="6" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="16" cy="24" r="4" stroke="currentColor" strokeWidth="1.5" />
                <line x1="16" y1="14" x2="16" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
            <h1 className="text-3xl text-[var(--foreground)] mb-2">
              <span className="font-light">Set Your </span>
              <span className="font-semibold">Password</span>
            </h1>
            <p className="text-[var(--foreground-muted)]">
              {passwordSet
                ? 'Password set successfully. Redirecting...'
                : !sessionReady
                ? 'Verifying invite link...'
                : 'Choose a password for your account'}
            </p>
          </div>

          {!passwordSet && sessionReady && (
            <form onSubmit={handleSetPassword} className="space-y-6">
              {error && (
                <div className="p-4 rounded-xl bg-[var(--error)]/8 border border-[var(--error)]/20">
                  <p className="text-sm text-[var(--error)]">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="new-password" className="block text-sm font-medium text-[var(--foreground-muted)] mb-2">
                  Password
                </label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full px-4 py-3 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:outline-none focus:border-[var(--input-focus-border)] focus:ring-2 focus:ring-[var(--input-focus-ring)] transition-all"
                  placeholder="At least 6 characters"
                />
              </div>

              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium text-[var(--foreground-muted)] mb-2">
                  Confirm Password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="w-full px-4 py-3 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:outline-none focus:border-[var(--input-focus-border)] focus:ring-2 focus:ring-[var(--input-focus-ring)] transition-all"
                  placeholder="Re-enter your password"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full px-6 py-3 font-medium rounded-xl bg-[var(--primary)] text-[var(--background-main)] hover:bg-[var(--primary-light)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Setting password...' : 'Set Password'}
              </button>
            </form>
          )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Focal gradient behind card */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 50% 40% at 50% 50%, rgba(148, 163, 184, 0.08) 0%, transparent 70%)',
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="glass-card p-8 w-full max-w-md relative"
        style={{ background: 'var(--glass-bg)' }}
      >
        <div className="mb-8 text-center">
          {/* Decorative thermometer icon */}
          <div className="flex justify-center mb-4">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-[var(--foreground-muted)]">
              <rect x="13" y="4" width="6" height="18" rx="3" stroke="currentColor" strokeWidth="1.5" />
              <circle cx="16" cy="24" r="4" stroke="currentColor" strokeWidth="1.5" />
              <line x1="16" y1="14" x2="16" y2="20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className="text-3xl text-[var(--foreground)] mb-2">
            <span className="font-light">Welcome </span>
            <span className="font-semibold">Back</span>
          </h1>
          <p className="text-[var(--foreground-muted)]">Sign in to access the dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-[var(--error)]/8 border border-[var(--error)]/20">
              <p className="text-sm text-[var(--error)]">{error}</p>
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-[var(--foreground-muted)] mb-2"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full px-4 py-3 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:outline-none focus:border-[var(--input-focus-border)] focus:ring-2 focus:ring-[var(--input-focus-ring)] transition-all"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[var(--foreground-muted)] mb-2"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-xl bg-[var(--input-bg)] border border-[var(--input-border)] text-[var(--foreground)] placeholder-[var(--foreground-muted)] focus:outline-none focus:border-[var(--input-focus-border)] focus:ring-2 focus:ring-[var(--input-focus-ring)] transition-all"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full px-6 py-3 font-medium rounded-xl bg-[var(--primary)] text-[var(--background-main)] hover:bg-[var(--primary-light)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </motion.div>
    </div>
  );
}
