'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { UserMenu } from './UserMenu';

const NAV_LINKS = [
  { href: '/', label: 'Live' },
  { href: '/charts', label: 'Charts' },
  { href: '/compare', label: 'Compare' },
  { href: '/analysis', label: 'Analysis' },
  { href: '/deployments', label: 'Deployments' },
];

interface NavbarProps {
  onManageNodes?: () => void;
}

export function Navbar({ onManageNodes }: NavbarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const SCROLL_RANGE = 80;
    let ticking = false;

    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const t = Math.min(1, window.scrollY / SCROLL_RANGE);
          const el = wrapperRef.current;
          if (el) {
            el.style.setProperty('--navbar-t', t.toString());
            el.classList.toggle('navbar-stuck', t > 0.5);
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const gearIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );

  return (
    <div
      ref={wrapperRef}
      className="navbar-sticky-wrapper mb-10"
      style={{ '--navbar-t': '0' } as React.CSSProperties}
    >
    <nav className="flex items-center justify-between gap-4 relative">
      {/* Desktop: nav links left, user menu right */}
      <div className="hidden sm:flex items-center gap-4">
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
              {link.label}
            </Link>
          ))}
        </div>
      </div>
      <div className="hidden sm:block">
        <UserMenu />
      </div>

      {/* Mobile: profile/theme/gear left, hamburger right */}
      <div className="sm:hidden flex items-center gap-2">
        <UserMenu />
        {onManageNodes && (
          <button
            onClick={onManageNodes}
            className="w-10 h-10 rounded-full bg-[var(--active-bg)] border border-[var(--btn-border-hover)] flex items-center justify-center text-[var(--foreground-secondary)] hover:text-[var(--foreground)] transition-all"
            aria-label="Manage nodes"
          >
            {gearIcon}
          </button>
        )}
      </div>

      <div className="sm:hidden relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="btn-glass p-3 w-12 h-12 flex flex-col items-center justify-center gap-1.5 relative z-50"
          aria-label="Toggle menu"
        >
          <span
            className={`block w-6 h-0.5 bg-[var(--primary)] rounded-full transition-all duration-300 ease-in-out ${
              isOpen ? 'rotate-45 translate-y-2' : ''
            }`}
          />
          <span
            className={`block w-6 h-0.5 bg-[var(--primary)] rounded-full transition-all duration-300 ease-in-out ${
              isOpen ? 'opacity-0 scale-0' : ''
            }`}
          />
          <span
            className={`block w-6 h-0.5 bg-[var(--primary)] rounded-full transition-all duration-300 ease-in-out ${
              isOpen ? '-rotate-45 -translate-y-2' : ''
            }`}
          />
        </button>

        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="absolute top-14 right-0 w-48 bg-[var(--glass-bg-strong)] backdrop-blur-xl border border-[var(--glass-border)] rounded-2xl p-2 z-40 shadow-xl"
            >
              <div className="flex flex-col gap-1">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsOpen(false)}
                    className={`px-4 py-3 text-sm font-medium rounded-xl transition-colors ${
                      isActive(link.href)
                        ? 'bg-[var(--active-bg)] text-[var(--foreground)] font-semibold border-l-2 border-[var(--primary)]'
                        : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg)]'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </nav>
    </div>
  );
}
