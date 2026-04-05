// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { getServerUser, isAuthenticated } from '../serverAuth';

describe('serverAuth', () => {
  const mockGetUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';

    vi.mocked(createServerClient).mockReturnValue({
      auth: { getUser: mockGetUser },
    } as never);

    vi.mocked(cookies).mockResolvedValue({
      getAll: vi.fn(() => []),
      set: vi.fn(),
    } as never);
  });

  describe('getServerUser', () => {
    it('returns user when authenticated', async () => {
      const user = { id: '1', email: 'test@example.com' };
      mockGetUser.mockResolvedValue({ data: { user }, error: null });
      expect(await getServerUser()).toEqual(user);
    });

    it('returns null on error', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Error' },
      });
      expect(await getServerUser()).toBeNull();
    });

    it('returns null when no user', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
      expect(await getServerUser()).toBeNull();
    });
  });

  describe('isAuthenticated', () => {
    it('returns true when user exists', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: '1' } },
        error: null,
      });
      expect(await isAuthenticated()).toBe(true);
    });

    it('returns false when user is null', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });
      expect(await isAuthenticated()).toBe(false);
    });
  });
});
