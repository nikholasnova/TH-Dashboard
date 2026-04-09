'use client';

import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#f0f1f3' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '1rem',
        }}>
          <div style={{
            background: 'rgba(255,255,255,0.72)',
            backdropFilter: 'blur(24px)',
            borderRadius: '1.25rem',
            padding: '2rem',
            textAlign: 'center',
            maxWidth: '28rem',
            border: '1.5px solid rgba(0,0,0,0.06)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.03)',
          }}>
            <h2 style={{ color: '#0f172a', fontSize: '1.25rem', marginBottom: '0.5rem' }}>
              Something went wrong
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              {error.message || 'A critical error occurred.'}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
              <button
                onClick={reset}
                style={{
                  background: 'rgba(0,0,0,0.05)',
                  border: '1px solid rgba(0,0,0,0.1)',
                  borderRadius: '0.75rem',
                  color: '#0f172a',
                  padding: '0.5rem 1.5rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Try again
              </button>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- global-error renders outside the Next.js app shell, Link is unavailable */}
              <a
                href="/"
                style={{
                  background: 'rgba(0,0,0,0.05)',
                  border: '1px solid rgba(0,0,0,0.1)',
                  borderRadius: '0.75rem',
                  color: '#0f172a',
                  padding: '0.5rem 1.5rem',
                  textDecoration: 'none',
                  fontSize: '0.875rem',
                }}
              >
                Go home
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

