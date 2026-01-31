'use client';

import { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';

export interface AuthResult {
  success: boolean;
  error?: string;
}

// Sign in with email and password
export async function signIn(
  email: string,
  password: string
): Promise<AuthResult> {
  if (!supabase) {
    return { success: false, error: 'Supabase client not configured' };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Sign out
export async function signOut(): Promise<AuthResult> {
  if (!supabase) {
    return { success: false, error: 'Supabase client not configured' };
  }

  const { error } = await supabase.auth.signOut();

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Get current session
export async function getSession(): Promise<Session | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error('Error getting session:', error.message);
    return null;
  }

  return data.session;
}

// Subscribe to auth state changes
export function onAuthStateChange(
  callback: (session: Session | null) => void
): (() => void) | null {
  if (!supabase) {
    return null;
  }

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return () => subscription.unsubscribe();
}
