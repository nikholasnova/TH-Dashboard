'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserMenu } from './UserMenu';

const NAV_LINKS = [
  { href: '/', label: 'Live' },
  { href: '/charts', label: 'Charts' },
  { href: '/compare', label: 'Compare' },
  { href: '/analysis', label: 'Analysis' },
  { href: '/deployments', label: 'Deploy' },
];

const NAV_ICONS: Record<string, React.ReactNode> = {
  '/': (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  ),
  '/charts': (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  ),
  '/compare': (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="18" rx="1" /><rect x="14" y="3" width="7" height="18" rx="1" />
    </svg>
  ),
  '/analysis': (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 3h6v7l3 7H6l3-7V3z" /><path d="M10 3h4" /><circle cx="12" cy="14" r="1" />
    </svg>
  ),
  '/deployments': (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
    </svg>
  ),
};

interface NavbarProps {
  onManageNodes?: () => void;
}

export function Navbar({ onManageNodes }: NavbarProps) {
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const THRESHOLD = 16;

    const onScroll = () => {
      const el = wrapperRef.current;
      if (el) el.classList.toggle('navbar-stuck', window.scrollY > THRESHOLD);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Desktop nav — unchanged */}
      <div
        ref={wrapperRef}
        className="navbar-sticky-wrapper mb-10 hidden sm:block"
      >
        <nav className="flex items-center justify-between gap-4 relative">
          <div className="flex items-center gap-4">
            <div className="flex glass-card p-2 gap-1.5" style={{ background: 'var(--glass-bg)', borderWidth: '1px' }}>
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-6 py-3 text-sm font-medium rounded-xl transition-colors ${
                    isActive(link.href)
                      ? 'nav-active font-semibold'
                      : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)]'
                  }`}
                >
                  {link.label === 'Deploy' ? 'Deployments' : link.label}
                </Link>
              ))}
            </div>
          </div>
          <div>
            <UserMenu />
          </div>
        </nav>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="mobile-tab-bar sm:hidden">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`mobile-tab-item ${isActive(link.href) ? 'mobile-tab-active' : ''}`}
          >
            {NAV_ICONS[link.href]}
            <span className="text-[10px] leading-tight mt-0.5">{link.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
