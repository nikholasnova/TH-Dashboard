'use client';

import { useState, useRef, useEffect } from 'react';
import posthog from 'posthog-js';
import { useSession } from './AuthProvider';
import { signOut } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export function UserMenu() {
  const { session, user, role } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [copiedGuestLink, setCopiedGuestLink] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCopyGuestLink = async () => {
    try {
      const res = await fetch('/api/guest?action=link');
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to generate guest link');
        return;
      }
      const { link } = await res.json();
      await navigator.clipboard.writeText(link);
      setCopiedGuestLink(true);
      setTimeout(() => setCopiedGuestLink(false), 3000);
    } catch {
      alert('Failed to generate guest link');
    }
  };

  const handleSignOut = async () => {
    setIsSigningOut(true);
    posthog.capture('user_signed_out');
    await signOut();
    setIsOpen(false);
    router.push('/login');
  };

  if (!session || !user) {
    return (
      <a
        href="/login"
        className="px-4 py-2 text-sm text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
      >
        Sign In
      </a>
    );
  }

  const email = user.email || 'User';
  const initials = email.substring(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-2">
      {/* Profile */}
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-11 h-11 rounded-full bg-[var(--active-bg)] flex items-center justify-center text-[var(--foreground-secondary)] font-semibold text-sm hover:bg-[var(--hover-bg)] transition-colors"
          aria-label="User menu"
        >
          {initials}
        </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-[var(--glass-bg-strong)] backdrop-blur-xl rounded-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200 shadow-xl">
          <div className="pb-3 mb-3 border-b border-[var(--divider)]">
            <p className="text-xs text-[var(--foreground-muted)] mb-1">Signed in as</p>
            <p className="text-sm text-[var(--foreground)] font-medium truncate">{email}</p>
          </div>

          <div className="pb-3 mb-3 border-b border-[var(--divider)] space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--foreground-muted)]">Status</span>
              <span className="text-[var(--success)] font-medium">● Active</span>
            </div>
          </div>

          {role === 'admin' && (
            <button
              onClick={handleCopyGuestLink}
              className="w-full px-4 py-2 text-sm text-[var(--foreground-muted)] hover:bg-[var(--hover-bg)] rounded-lg transition-colors font-medium mb-1"
            >
              {copiedGuestLink ? 'Guest Link Copied!' : 'Copy Guest Link'}
            </button>
          )}

          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full px-4 py-2 text-sm text-[var(--error)] hover:bg-[var(--error)]/10 rounded-lg transition-colors disabled:opacity-50 font-medium"
          >
            {isSigningOut ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
