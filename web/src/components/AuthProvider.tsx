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
import { supabase } from '@/lib/supabase';

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

async function fetchRole(userId: string): Promise<UserRole> {
  if (!supabase) return 'user';
  try {
    const { data, error } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return 'user';
    return (data?.role as UserRole) ?? 'user';
  } catch {
    return 'user';
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole>('user');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function hydrate(nextSession: Session | null) {
      if (cancelled) return;
      setSession(nextSession);
      if (nextSession?.user) {
        const r = await fetchRole(nextSession.user.id);
        if (!cancelled) setRole(r);
      } else {
        setRole('user');
      }
      if (!cancelled) setLoading(false);
    }

    getSession().then(hydrate);
    const unsubscribe = onAuthStateChange((s) => { hydrate(s); });

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const user = session?.user ?? null;

  const value: AuthContextType = { session, user, loading, role };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
