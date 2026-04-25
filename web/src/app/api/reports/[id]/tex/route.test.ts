// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerUserMock = vi.fn();
const getMetaMock = vi.fn();
const getTexMock = vi.fn();

vi.mock('@/lib/serverAuth', () => ({
  getServerUser: getServerUserMock,
}));

vi.mock('@/lib/reportStore', () => ({
  getMeta: getMetaMock,
  getTex: getTexMock,
}));

const REPORT_ID = '11111111-1111-4111-8111-111111111111';

describe('/api/reports/[id]/tex route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires an authenticated user', async () => {
    getServerUserMock.mockResolvedValue(null);
    const { GET } = await import('./route');

    const res = await GET(new Request(`http://localhost/api/reports/${REPORT_ID}/tex`), {
      params: Promise.resolve({ id: REPORT_ID }),
    });

    expect(res.status).toBe(401);
    expect(await res.text()).toBe('Unauthorized');
  });

  it('does not serve tex owned by another user', async () => {
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
    getMetaMock.mockResolvedValue({
      filename: 'report.tex',
      byte_size: 12,
      user_id: 'user-2',
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-01-02T00:00:00.000Z',
    });
    const { GET } = await import('./route');

    const res = await GET(new Request(`http://localhost/api/reports/${REPORT_ID}/tex`), {
      params: Promise.resolve({ id: REPORT_ID }),
    });

    expect(res.status).toBe(404);
    expect(getTexMock).not.toHaveBeenCalled();
  });

  it('serves tex only to the owner without permissive CORS', async () => {
    getServerUserMock.mockResolvedValue({ id: 'user-1' });
    getMetaMock.mockResolvedValue({
      filename: 'report".tex',
      byte_size: 12,
      user_id: 'user-1',
      start: '2026-01-01T00:00:00.000Z',
      end: '2026-01-02T00:00:00.000Z',
    });
    getTexMock.mockResolvedValue('tex source');
    const { GET } = await import('./route');

    const res = await GET(new Request(`http://localhost/api/reports/${REPORT_ID}/tex`), {
      params: Promise.resolve({ id: REPORT_ID }),
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('tex source');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=600');
    expect(res.headers.get('Content-Disposition')).toBe('attachment; filename="report.tex"');
  });
});
