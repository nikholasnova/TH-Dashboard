'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from './AuthProvider';
import { signOut } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/contexts/ThemeContext';

export function UserMenu() {
  const { session, user } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { theme, resolved, toggle } = useTheme();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSignOut = async () => {
    setIsSigningOut(true);
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
          className="w-10 h-10 rounded-full bg-[var(--active-bg)] border border-[var(--btn-border-hover)] flex items-center justify-center text-[var(--foreground-secondary)] font-semibold text-sm hover:bg-[var(--active-bg)] hover:border-[var(--btn-border-hover)] transition-all"
          aria-label="User menu"
        >
          {initials}
        </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-[var(--glass-bg-strong)] backdrop-blur-xl border border-[var(--divider)] rounded-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200 shadow-xl">
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

      {/* Theme toggle */}
      <button
        onClick={toggle}
        className="w-10 h-10 rounded-full bg-[var(--active-bg)] border border-[var(--btn-border-hover)] flex items-center justify-center text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-all"
        aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}
        title={theme === 'dark' ? 'Dark' : 'Light'}
      >
        {resolved === 'dark' ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
        )}
      </button>
    </div>
  );
}
