'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import posthog from 'posthog-js';
import { useSession } from './AuthProvider';
import { AIChat } from './AIChat';

export function ChatShell() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { user, loading } = useSession();

  const handleOpen = () => {
    setIsOpen(true);
    posthog.capture('chat_opened');
  };

  // Escape key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isFullscreen]);

  // Lock body scroll when chat covers the viewport (mobile / fullscreen)
  useEffect(() => {
    const shouldLock = isOpen && (isFullscreen || window.innerWidth < 640);
    if (!shouldLock) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen, isFullscreen]);

  if (loading || !user) return null;

  const containerClass = [
    'fixed z-50 flex flex-col transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
    isFullscreen
      ? 'inset-0'
      : 'right-0 sm:right-6 w-full sm:w-[42rem] h-[75svh] sm:h-[42rem] sm:max-h-[82vh]',
  ].join(' ');

  const containerStyle = isFullscreen
    ? undefined
    : {
        bottom: 'max(var(--bottom-spacing, 0px), 40px)',
        maxHeight: 'calc(100svh - max(var(--bottom-spacing, 0px), 40px))',
      } as React.CSSProperties;

  const headerClass = isFullscreen
    ? 'flex justify-between items-center px-4 py-2 bg-[var(--glass-bg-strong)] backdrop-blur-xl border-b border-[var(--glass-border)]'
    : 'flex justify-between items-center px-4 py-2 bg-[var(--glass-bg-strong)] backdrop-blur-xl border border-[var(--glass-border)] border-b-0 rounded-t-xl sm:rounded-t-2xl';

  const bodyClass = isFullscreen
    ? 'flex-1 min-h-0 bg-[var(--glass-bg-strong)] backdrop-blur-xl border-x border-[var(--glass-border)] overflow-hidden flex flex-col'
    : 'flex-1 min-h-0 bg-[var(--glass-bg-strong)] backdrop-blur-xl border border-[var(--glass-border)] border-t-0 rounded-b-2xl overflow-hidden flex flex-col overscroll-contain';

  return (
    <>
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={handleOpen}
            className="fixed sm:bottom-6 right-4 sm:right-6 z-40 w-14 h-14 rounded-full btn-glass flex items-center justify-center shadow-lg hover:shadow-xl transition-shadow"
            style={{ bottom: 'calc(var(--bottom-spacing, 80px) + 16px)' }}
            aria-label="Open Kelvin AI"
            title="Open Kelvin AI"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0.5, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.4 }}
            transition={{ duration: 0.05, ease: 'linear' }}
            style={{ ...containerStyle, transformOrigin: 'bottom right' } as React.CSSProperties}
            className={containerClass}
          >
            <div className={headerClass}>
              <span className="text-sm font-semibold text-[var(--foreground)]">Kelvin AI</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsFullscreen(!isFullscreen)}
                  className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors p-2.5 sm:p-1"
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  {isFullscreen ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-3.5 sm:h-3.5">
                      <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-3.5 sm:h-3.5">
                      <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => { setIsOpen(false); setIsFullscreen(false); }}
                  className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors p-2.5 sm:p-1"
                  aria-label="Close chat"
                  title="Close chat"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="sm:w-4 sm:h-4">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
            <div className={bodyClass}>
              <AIChat />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
