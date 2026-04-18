'use client';

import { useEffect } from 'react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  count: number;
  isDeleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDeleteModal({ isOpen, count, isDeleting, onConfirm, onClose }: ConfirmDeleteModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isDeleting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm"
        onClick={() => { if (!isDeleting) onClose(); }}
      />
      <div className="relative glass-card w-full max-w-md mx-4 overflow-hidden flex flex-col">
        <div className="p-6 sm:p-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-bold text-[var(--foreground)]">Delete readings</h2>
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors p-2 disabled:opacity-50"
              aria-label="Close"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="alert-accent text-[var(--error)] mb-5">
            <p className="text-sm font-medium mb-1">This action cannot be undone</p>
            <p className="text-sm text-[var(--foreground)]">
              You&rsquo;re about to permanently delete{' '}
              <strong>{count.toLocaleString()}</strong> reading{count === 1 ? '' : 's'} from the database.
            </p>
          </div>

          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2.5 text-sm text-[var(--foreground-muted)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isDeleting}
              className="btn-glass px-6 py-2.5 text-sm font-semibold text-[var(--error)] disabled:opacity-50"
            >
              {isDeleting ? 'Deleting…' : `Delete ${count.toLocaleString()}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
