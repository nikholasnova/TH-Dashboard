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

  const email = user.email || 'User';
  const initials = email.substring(0, 2).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-10 h-10 rounded-full bg-[#0075ff]/20 border border-[#0075ff]/40 flex items-center justify-center text-[#0075ff] font-semibold text-sm hover:bg-[#0075ff]/30 hover:border-[#0075ff]/60 transition-all"
        aria-label="User menu"
      >
        {initials}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-[#1a1f2e]/95 backdrop-blur-xl border border-white/20 rounded-2xl p-4 z-50 animate-in fade-in slide-in-from-top-2 duration-200 shadow-xl">
          <div className="pb-3 mb-3 border-b border-white/20">
            <p className="text-xs text-[#c8d0e0] mb-1">Signed in as</p>
            <p className="text-sm text-white font-medium truncate">{email}</p>
          </div>

          <div className="pb-3 mb-3 border-b border-white/20 space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-[#c8d0e0]">Status</span>
              <span className="text-[#01b574] font-medium">● Active</span>
            </div>
          </div>

          <button
            onClick={handleSignOut}
            disabled={isSigningOut}
            className="w-full px-4 py-2 text-sm text-[#ff4d4d] hover:bg-[#ff4d4d]/15 rounded-lg transition-colors disabled:opacity-50 font-medium"
          >
            {isSigningOut ? 'Signing out...' : 'Sign Out'}
          </button>
        </div>
      )}
    </div>
  );
}
