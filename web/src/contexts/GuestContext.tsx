'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface GuestContextType {
  isGuest: boolean;
}

const GuestContext = createContext<GuestContextType>({ isGuest: false });

export function useGuest() {
  return useContext(GuestContext);
}

export function GuestProvider({ children }: { children: ReactNode }) {
  const [isGuest] = useState(() => {
    if (typeof document === 'undefined') return false;
    return document.cookie.includes('guest_token=');
  });

  return (
    <GuestContext.Provider value={{ isGuest }}>
      {children}
    </GuestContext.Provider>
  );
}
