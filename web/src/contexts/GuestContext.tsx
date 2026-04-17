'use client';

import { createContext, useCallback, useContext, useState, ReactNode } from 'react';

interface GuestContextType {
  isGuest: boolean;
  clearGuest: () => void;
}

const GuestContext = createContext<GuestContextType>({
  isGuest: false,
  clearGuest: () => {},
});

export function useGuest() {
  return useContext(GuestContext);
}

export function GuestProvider({ children }: { children: ReactNode }) {
  const [isGuest, setIsGuest] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.cookie.includes('guest_mode=1');
  });

  const clearGuest = useCallback(() => {
    document.cookie = 'guest_mode=; Max-Age=0; path=/';
    fetch('/api/guest', { method: 'DELETE' }).catch(() => {});
    setIsGuest(false);
  }, []);

  return (
    <GuestContext.Provider value={{ isGuest, clearGuest }}>
      {children}
    </GuestContext.Provider>
  );
}
