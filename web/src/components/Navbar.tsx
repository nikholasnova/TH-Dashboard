'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserMenu } from './UserMenu';

const NAV_LINKS = [
  { href: '/', label: 'Live' },
  { href: '/charts', label: 'Charts' },
  { href: '/compare', label: 'Compare' },
  { href: '/deployments', label: 'Deployments' },
];

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <nav className="flex items-center justify-between mb-10 gap-4 relative">
      {/* Desktop nav */}
      <div className="hidden sm:flex glass-card p-2 gap-2">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`px-6 py-3 text-sm font-medium rounded-xl transition-colors ${
              isActive(link.href)
                ? 'nav-active text-white font-semibold'
                : 'text-[#a0aec0] hover:text-white'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* Mobile hamburger + dropdown container */}
      <div className="sm:hidden relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="glass-card p-3 w-12 h-12 flex flex-col items-center justify-center gap-1.5 relative z-50"
          aria-label="Toggle menu"
        >
          {/* Animated hamburger lines */}
          <span
            className={`block w-6 h-0.5 bg-white rounded-full transition-all duration-300 ease-in-out ${
              isOpen ? 'rotate-45 translate-y-2' : ''
            }`}
          />
          <span
            className={`block w-6 h-0.5 bg-white rounded-full transition-all duration-300 ease-in-out ${
              isOpen ? 'opacity-0 scale-0' : ''
            }`}
          />
          <span
            className={`block w-6 h-0.5 bg-white rounded-full transition-all duration-300 ease-in-out ${
              isOpen ? '-rotate-45 -translate-y-2' : ''
            }`}
          />
        </button>

        {/* Mobile dropdown menu - positioned below hamburger */}
        {isOpen && (
          <div className="absolute top-14 left-0 w-48 bg-[#1a1f2e]/95 backdrop-blur-xl border border-white/20 rounded-2xl p-2 z-40 animate-in fade-in slide-in-from-top-2 duration-200 shadow-xl">
            <div className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className={`px-4 py-3 text-sm font-medium rounded-xl transition-colors ${
                    isActive(link.href)
                      ? 'bg-white/15 text-white font-semibold'
                      : 'text-[#c8d0e0] hover:text-white hover:bg-white/10'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* User menu (always visible) */}
      <UserMenu />
    </nav>
  );
}
