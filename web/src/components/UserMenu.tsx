'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession } from './AuthProvider';
import { signOut } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export function UserMenu() {
  const { session, user } = useSession();
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close menu when clicking outside
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
        className="px-4 py-2 text-sm text-[#a0aec0] hover:text-white transition-colors"
      >
        Sign In
      </a>
    );
  }

  // Get initials from email
  const email = user.email || 'User';
  const initials = email.substring(0, 2).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      {/* Profile Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-full bg-[#0075ff]/20 border border-[#0075ff]/40 flex items-center justify-center text-[#0075ff] font-semibold text-sm hover:bg-[#0075ff]/30 hover:border-[#0075ff]/60 transition-all"
        aria-label="User menu"
      >
        {initials}
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 glass-card p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
          {/* User Info */}
          <div className="pb-3 mb-3 border-b border-white/10">
            <p className="text-xs text-[#a0aec0] mb-1">Signed in as</p>
            <p className="text-sm text-white font-medium truncate">{email}</p>
          </div>

          {/* Session Info */}
          <div className="pb-3 mb-3 border-b border-white/10 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[#a0aec0]">Status</span>
              <span className="text-[#01b574]">● Active</span>
            </div>
          </div>

          {/* Sign Out Button */}
          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full px-4 py-2 text-sm text-[#e31a1a] hover:bg-[#e31a1a]/10 rounded-lg transition-colors disabled:opacity-50"
          >
            {isSigningOut ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      )}
    </div>
  );
}
