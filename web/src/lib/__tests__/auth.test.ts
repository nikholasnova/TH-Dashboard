import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = {
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
};

let mockSupabase: { auth: typeof mockAuth } | null = { auth: mockAuth };

vi.mock('../supabase', () => ({
  get supabase() {
    return mockSupabase;
  },
}));

import { signIn, signOut, getSession, onAuthStateChange } from '../auth';

describe('auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase = { auth: mockAuth };
  });

  describe('signIn', () => {
    it('returns success on valid credentials', async () => {
      mockAuth.signInWithPassword.mockResolvedValue({ error: null });
      const result = await signIn('test@example.com', 'password');
      expect(result).toEqual({ success: true });
      expect(mockAuth.signInWithPassword).toHaveBeenCalledWith({
        email: 'test@example.com',
        password: 'password',
      });
    });

    it('returns error message on failure', async () => {
      mockAuth.signInWithPassword.mockResolvedValue({
        error: { message: 'Invalid login credentials' },
      });
      const result = await signIn('bad@example.com', 'wrong');
      expect(result).toEqual({ success: false, error: 'Invalid login credentials' });
    });

    it('returns error when supabase is null', async () => {
      mockSupabase = null;
      const result = await signIn('test@example.com', 'pass');
      expect(result).toEqual({ success: false, error: 'Supabase client not configured' });
    });
  });

  describe('signOut', () => {
    it('returns success', async () => {
      mockAuth.signOut.mockResolvedValue({ error: null });
      expect(await signOut()).toEqual({ success: true });
    });

    it('returns error on failure', async () => {
      mockAuth.signOut.mockResolvedValue({ error: { message: 'Sign out failed' } });
      expect(await signOut()).toEqual({ success: false, error: 'Sign out failed' });
    });

    it('returns error when supabase is null', async () => {
      mockSupabase = null;
      expect(await signOut()).toEqual({ success: false, error: 'Supabase client not configured' });
    });
  });

  describe('getSession', () => {
    it('returns session', async () => {
      const session = { access_token: 'token', user: { id: '1' } };
      mockAuth.getSession.mockResolvedValue({ data: { session }, error: null });
      expect(await getSession()).toEqual(session);
    });

    it('returns null on error', async () => {
      mockAuth.getSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Error' },
      });
      expect(await getSession()).toBeNull();
    });

    it('returns null when supabase is null', async () => {
      mockSupabase = null;
      expect(await getSession()).toBeNull();
    });
  });

  describe('onAuthStateChange', () => {
    it('subscribes and returns unsubscribe function', () => {
      const unsubscribe = vi.fn();
      mockAuth.onAuthStateChange.mockReturnValue({
        data: { subscription: { unsubscribe } },
      });

      const unsub = onAuthStateChange(vi.fn());
      expect(unsub).toBeTypeOf('function');
      unsub!();
      expect(unsubscribe).toHaveBeenCalled();
    });

    it('calls callback with session on state change', () => {
      const callback = vi.fn();
      mockAuth.onAuthStateChange.mockImplementation((handler: (_e: string, s: unknown) => void) => {
        handler('SIGNED_IN', { user: { id: '1' } });
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      });

      onAuthStateChange(callback);
      expect(callback).toHaveBeenCalledWith({ user: { id: '1' } });
    });

    it('returns null when supabase is null', () => {
      mockSupabase = null;
      expect(onAuthStateChange(vi.fn())).toBeNull();
    });
  });
});
