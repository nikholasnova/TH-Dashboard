'use client';

import { useRef, useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { motion, LayoutGroup } from 'framer-motion';
import { UserMenu } from './UserMenu';

const NAV_LINKS = [
  { href: '/', label: 'Live', mobileLabel: 'Live' },
  { href: '/charts', label: 'Charts', mobileLabel: 'Charts' },
  { href: '/compare', label: 'Compare', mobileLabel: 'Compare' },
  { href: '/data', label: 'Data', mobileLabel: 'Data' },
  { href: '/analysis', label: 'Analysis', mobileLabel: 'Analysis' },
  { href: '/deployments', label: 'Deployments', mobileLabel: 'Deploy' },
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
  '/data': (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3" /><path d="M3 5v6a9 3 0 0 0 18 0V5" /><path d="M3 11v6a9 3 0 0 0 18 0v-6" />
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

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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

  // Clear optimistic pending href once the real pathname has caught up.
  // Render-phase state update: React bails out once pendingHref is null.
  if (pendingHref !== null) {
    const satisfied = pendingHref === '/' ? pathname === '/' : pathname.startsWith(pendingHref);
    if (satisfied) setPendingHref(null);
  }

  const activePath = pendingHref ?? pathname;

  const isActive = (href: string) => {
    if (href === '/') return activePath === '/';
    return activePath.startsWith(href);
  };

  const handleNav = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    if (href === pathname) return;
    setPendingHref(href);
    startTransition(() => router.push(href));
  };

  return (
    <>
      {/* Desktop: editorial text nav. Shared indicator slides between active links. */}
      <div className="hidden sm:block border-b border-[var(--hairline)] mb-10 md:mb-12 lg:mb-14">
        <nav className="flex items-end justify-between gap-6 md:gap-8 pt-3 md:pt-4 lg:pt-5">
          <LayoutGroup id="nav">
            <div
              className="flex items-end gap-5 md:gap-8 lg:gap-10 xl:gap-12"
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {NAV_LINKS.map((link, idx) => {
                const active = isActive(link.href);
                const hovered = hoveredIdx === idx;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={handleNav(link.href)}
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onFocus={() => setHoveredIdx(idx)}
                    className={`relative text-base md:text-lg lg:text-xl xl:text-2xl tracking-tight pb-4 md:pb-5 lg:pb-6 transition-colors ${
                      active
                        ? 'text-[var(--fg)]'
                        : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                    }`}
                  >
                    {hovered && (
                      <motion.span
                        layoutId="nav-hover-bubble"
                        aria-hidden
                        className="absolute rounded-lg bg-[var(--hover-bg)]"
                        style={{
                          top: '-0.4em',
                          left: '-0.7em',
                          right: '-0.7em',
                          height: '2.2em',
                          zIndex: -1,
                        }}
                        transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.5 }}
                      />
                    )}
                    <span className="relative">{link.label}</span>
                    {active && (
                      <motion.span
                        layoutId="nav-active-underline"
                        aria-hidden
                        className="absolute left-0 right-0 -bottom-px bg-[var(--fg)]"
                        style={{ height: '3px' }}
                        transition={{ type: 'spring', stiffness: 380, damping: 32, mass: 0.6 }}
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </LayoutGroup>
          <div className="pb-3 md:pb-3.5 lg:pb-4">
            <UserMenu />
          </div>
        </nav>
      </div>

      {/* Mobile bottom tab bar — unchanged */}
      <nav className="mobile-tab-bar sm:hidden" ref={wrapperRef}>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`mobile-tab-item ${isActive(link.href) ? 'mobile-tab-active' : ''}`}
          >
            {NAV_ICONS[link.href]}
            <span className="text-[11px] leading-tight mt-0.5">{link.mobileLabel}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
