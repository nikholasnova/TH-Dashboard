import { useEffect } from 'react';

export function useScrollLock(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);
}
