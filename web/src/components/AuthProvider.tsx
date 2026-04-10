'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { Session, User } from '@supabase/supabase-js';
import { getSession, onAuthStateChange } from '@/lib/auth';

type UserRole = 'admin' | 'user';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  role: UserRole;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  role: 'user',
});

export function useSession() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useSession must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSession().then((session) => {
      setSession(session);
      setLoading(false);
    });

    const unsubscribe = onAuthStateChange((session) => {
      setSession(session);
      setLoading(false);
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const user = session?.user ?? null;
  const role: UserRole =
    (user?.app_metadata?.role as UserRole) ?? 'user';

  const value: AuthContextType = {
    session,
    user,
    loading,
    role,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
