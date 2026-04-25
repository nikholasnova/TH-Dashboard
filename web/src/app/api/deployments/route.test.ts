// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const getServerUserMock = vi.fn();
const requireAdminMock = vi.fn();
const enforceOriginMock = vi.fn(() => null);
const getServerClientMock = vi.fn();

vi.mock('@/lib/serverAuth', () => ({
  getServerUser: getServerUserMock,
  requireAdmin: requireAdminMock,
  enforceOrigin: enforceOriginMock,
}));

vi.mock('@/lib/supabase/server', () => ({
  getServerClient: getServerClientMock,
}));

function makeQuery(result: unknown = { data: null, error: null }) {
  const query: Record<string, unknown> = {};
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.insert = vi.fn(() => query);
  query.update = vi.fn(() => query);
  query.single = vi.fn(async () => result);
  query.maybeSingle = vi.fn(async () => result);
  return query as {
    select: ReturnType<typeof vi.fn>;
    eq: ReturnType<typeof vi.fn>;
    insert: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    single: ReturnType<typeof vi.fn>;
    maybeSingle: ReturnType<typeof vi.fn>;
  };
}

describe('/api/deployments route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
  });

  it('lets signed-in users create deployments owned by themselves', async () => {
    const insertQuery = makeQuery({
      data: { id: 1, device_id: 'node1', owner_id: 'user-1' },
      error: null,
    });
    getServerClientMock.mockReturnValue({
      from: vi.fn(() => insertQuery),
    });
    const { POST } = await import('./route');

    const res = await POST(new Request('http://localhost/api/deployments', {
      method: 'POST',
      body: JSON.stringify({
        device_id: 'node1',
        name: 'Patio',
        location: 'Queen Creek',
      }),
    }) as never);

    expect(res.status).toBe(200);
    expect(insertQuery.insert).toHaveBeenCalledWith(expect.objectContaining({
      device_id: 'node1',
      name: 'Patio',
      owner_id: 'user-1',
    }));
  });

  it('blocks non-admin users from updating deployments owned by someone else', async () => {
    const ownerQuery = makeQuery({
      data: { owner_id: 'user-2' },
      error: null,
    });
    const roleQuery = makeQuery({
      data: { role: 'user' },
      error: null,
    });
    const updateQuery = makeQuery();
    const deploymentQueries = [ownerQuery, updateQuery];
    getServerClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'deployments') return deploymentQueries.shift();
        if (table === 'user_roles') return roleQuery;
        throw new Error(`Unexpected table ${table}`);
      }),
    });
    const { PATCH } = await import('./route');

    const res = await PATCH(new Request('http://localhost/api/deployments', {
      method: 'PATCH',
      body: JSON.stringify({ id: 1, name: 'Changed' }),
    }) as never);

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden' });
    expect(updateQuery.update).not.toHaveBeenCalled();
  });

  it('lets deployment owners update their own metadata', async () => {
    const ownerQuery = makeQuery({
      data: { owner_id: 'user-1' },
      error: null,
    });
    const updateQuery = makeQuery({
      data: { id: 1, name: 'Changed', owner_id: 'user-1' },
      error: null,
    });
    const deploymentQueries = [ownerQuery, updateQuery];
    getServerClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'deployments') return deploymentQueries.shift();
        throw new Error(`Unexpected table ${table}`);
      }),
    });
    const { PATCH } = await import('./route');

    const res = await PATCH(new Request('http://localhost/api/deployments', {
      method: 'PATCH',
      body: JSON.stringify({ id: 1, name: 'Changed' }),
    }) as never);

    expect(res.status).toBe(200);
    expect(updateQuery.update).toHaveBeenCalledWith({ name: 'Changed' });
  });

  it('keeps deployment deletion admin-only', async () => {
    requireAdminMock.mockResolvedValue({
      user: null,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });
    const { DELETE } = await import('./route');

    const res = await DELETE(new Request('http://localhost/api/deployments?id=1', {
      method: 'DELETE',
    }) as never);

    expect(res.status).toBe(403);
  });
});
