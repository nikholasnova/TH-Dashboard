'use client';

import { useState, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from '@/lib/auth';
import { useSession } from '@/components/AuthProvider';
import { useEffect } from 'react';

export default function LoginPage() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) {
      router.push('/');
    }
  }, [session, loading, router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const result = await signIn(email, password);

    if (result.success) {
      router.push('/');
    } else {
      setError(result.error || 'Invalid credentials');
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="glass-card p-8">
          <p className="text-[#a0aec0]">Loading...</p>
        </div>
      </div>
    );
  }

  if (session) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="glass-card p-8 w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Welcome Back</h1>
          <p className="text-[#a0aec0]">Sign in to access the dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-4 rounded-xl bg-[#e31a1a]/10 border border-[#e31a1a]/30">
              <p className="text-sm text-[#e31a1a]">{error}</p>
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-[#a0aec0] mb-2"
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
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-white placeholder-[#a0aec0]/50 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-colors"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-[#a0aec0] mb-2"
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
              className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/15 text-white placeholder-[#a0aec0]/50 focus:outline-none focus:border-white/30 focus:ring-1 focus:ring-white/20 transition-colors"
              placeholder="Enter your password"
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full btn-glass px-6 py-3 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
