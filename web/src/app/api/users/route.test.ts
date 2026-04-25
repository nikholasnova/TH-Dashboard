// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdminMock = vi.fn();
const enforceOriginMock = vi.fn(() => null);
const getServerClientMock = vi.fn();

vi.mock('@/lib/serverAuth', () => ({
  requireAdmin: requireAdminMock,
  enforceOrigin: enforceOriginMock,
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: getServerClientMock,
}));

vi.mock('@/lib/posthog-server', () => ({
  getPostHogClient: () => null,
}));

function makeQuery(result: unknown = { data: null, error: null }) {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.insert = vi.fn(async () => ({ error: null }));
  query.maybeSingle = vi.fn(async () => result);
  return query as {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  };
}

describe('/api/users route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAdminMock.mockResolvedValue({
      user: { id: 'admin-1' },
      response: null,
    });
  });

  it('rejects malformed invite emails before calling Supabase Auth', async () => {
    const inviteUserByEmail = vi.fn();
    getServerClientMock.mockReturnValue({
      auth: { admin: { inviteUserByEmail } },
      from: vi.fn(),
    });
    const { POST } = await import('./route');

    const res = await POST(new Request('http://localhost/api/users', {
      method: 'POST',
      body: JSON.stringify({ email: 'not-an-email' }),
    }) as never);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Valid email is required' });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('does not demote an existing admin when generating an invite link', async () => {
    const generateLink = vi.fn(async () => ({
      data: {
        user: { id: 'target-1' },
        properties: { action_link: 'https://supabase.example/action?token=abc' },
      },
      error: null,
    }));
    const roleQuery = makeQuery({
      data: { role: 'admin' },
      error: null,
    });
    const auditQuery = makeQuery();
    getServerClientMock.mockReturnValue({
      auth: { admin: { generateLink } },
      from: vi.fn((table: string) => {
        if (table === 'user_roles') return roleQuery;
        if (table === 'role_change_audit') return auditQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
    });
    const { POST } = await import('./route');

    const res = await POST(new Request('http://localhost/api/users', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
      body: JSON.stringify({ email: ' Existing.Admin@Example.COM ', linkOnly: true }),
    }) as never);

    expect(res.status).toBe(200);
    expect(generateLink).toHaveBeenCalledWith({
      type: 'invite',
      email: 'existing.admin@example.com',
    });
    expect(roleQuery.insert).not.toHaveBeenCalled();
    expect(auditQuery.insert).not.toHaveBeenCalled();
  });
});
