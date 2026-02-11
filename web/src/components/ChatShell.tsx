'use client';

import { useState, useEffect } from 'react';
import { useSession } from './AuthProvider';
import { AIChat } from './AIChat';

export function ChatShell() {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const { user, loading } = useSession();

  // Escape key exits fullscreen
  useEffect(() => {
    if (!isFullscreen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isFullscreen]);

  if (loading || !user) return null;

  const containerClass = isFullscreen
    ? 'fixed inset-0 z-50 flex flex-col'
    : 'fixed bottom-0 right-0 sm:bottom-6 sm:right-6 z-50 w-full sm:w-[42rem] flex flex-col sm:h-[44rem] max-h-[87vh]';

  const headerClass = isFullscreen
    ? 'flex justify-between items-center px-4 py-2 bg-[rgba(15,15,15,0.95)] backdrop-blur-xl border-b border-white/15'
    : 'flex justify-between items-center px-4 py-2 bg-[rgba(15,15,15,0.95)] backdrop-blur-xl border border-white/15 border-b-0 rounded-t-xl sm:rounded-t-2xl';

  const bodyClass = isFullscreen
    ? 'flex-1 min-h-0 bg-[rgba(15,15,15,0.95)] backdrop-blur-xl border-x border-white/15 overflow-hidden flex flex-col'
    : 'flex-1 min-h-0 bg-[rgba(15,15,15,0.95)] backdrop-blur-xl border border-white/15 border-t-0 rounded-b-none sm:rounded-b-2xl overflow-hidden flex flex-col';

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full btn-glass flex items-center justify-center shadow-lg hover:shadow-xl transition-all"
          title="Open Kelvin AI"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {isOpen && (
        <div className={containerClass}>
          <div className={headerClass}>
            <span className="text-sm font-semibold text-white">Kelvin AI</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="text-[#a0aec0] hover:text-white transition-colors p-1"
                title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              >
                {isFullscreen ? (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="4 14 10 14 10 20" /><polyline points="20 10 14 10 14 4" /><line x1="14" y1="10" x2="21" y2="3" /><line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" /><line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
                  </svg>
                )}
              </button>
              <button
                onClick={() => { setIsOpen(false); setIsFullscreen(false); }}
                className="text-[#a0aec0] hover:text-white transition-colors p-1"
                title="Close chat"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
          <div className={bodyClass}>
            <AIChat />
          </div>
        </div>
      )}
    </>
  );
}
