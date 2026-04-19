'use client';

import { useEffect } from 'react';
import { useScrollLock } from '@/hooks/useScrollLock';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  maxWidth?: 'md' | 'lg';
  disableClose?: boolean;
  enableEscape?: boolean;
  children: React.ReactNode;
}

const MAX_WIDTH_CLASS = {
  md: 'max-w-md',
  lg: 'max-w-lg',
} as const;

export function Modal({
  isOpen,
  onClose,
  maxWidth = 'lg',
  disableClose = false,
  enableEscape = false,
  children,
}: ModalProps) {
  useScrollLock(isOpen);

  useEffect(() => {
    if (!isOpen || !enableEscape) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !disableClose) onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, enableEscape, disableClose, onClose]);

  if (!isOpen) return null;

  const panelWidth = maxWidth === 'md' ? 'max-h-none' : 'max-h-[90vh]';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-[var(--overlay-bg)] backdrop-blur-sm"
        onClick={disableClose ? undefined : onClose}
      />
      <div
        className={`relative modal-panel w-full ${MAX_WIDTH_CLASS[maxWidth]} mx-4 ${panelWidth} overflow-hidden flex flex-col`}
      >
        {children}
      </div>
    </div>
  );
}
