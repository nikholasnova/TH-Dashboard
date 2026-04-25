// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { enforceOrigin, getServerUser, isAuthenticated, requireAdmin } from '../serverAuth';

describe('serverAuth', () => {
  const mockGetUser = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

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

  describe('requireAdmin', () => {
    it('rejects users without an admin database role even if metadata claims admin', async () => {
      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-1',
            email: 'user@example.com',
            user_metadata: { role: 'admin' },
          },
        },
        error: null,
      });
      const roleQuery: Record<string, unknown> = {};
      roleQuery.select = vi.fn(() => roleQuery);
      roleQuery.eq = vi.fn(() => roleQuery);
      roleQuery.maybeSingle = vi.fn(async () => ({ data: { role: 'user' }, error: null }));
      vi.mocked(createClient).mockReturnValue({ from: vi.fn(() => roleQuery) } as never);

      const result = await requireAdmin();
      expect(result.user).toBeNull();
      expect(result.response.status).toBe(403);
    });

    it('accepts users with an admin database role', async () => {
      const user = { id: 'admin-1', email: 'admin@example.com' };
      mockGetUser.mockResolvedValue({ data: { user }, error: null });
      const roleQuery: Record<string, unknown> = {};
      roleQuery.select = vi.fn(() => roleQuery);
      roleQuery.eq = vi.fn(() => roleQuery);
      roleQuery.maybeSingle = vi.fn(async () => ({ data: { role: 'admin' }, error: null }));
      vi.mocked(createClient).mockReturnValue({ from: vi.fn(() => roleQuery) } as never);

      await expect(requireAdmin()).resolves.toEqual({ user, response: null });
    });
  });

  describe('enforceOrigin', () => {
    it('blocks production mutating requests without the configured origin', () => {
      const originalEnv = { ...process.env };
      process.env.NODE_ENV = 'production';
      process.env.NEXT_PUBLIC_SITE_URL = 'https://app.example.com';
      const res = enforceOrigin(new Request('https://app.example.com/api/users', {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
      }));

      expect(res?.status).toBe(403);
      process.env = originalEnv;
    });
  });
});
