// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServerUserMock = vi.fn();
const enforceOriginMock = vi.fn(() => null);
const reportLimitMock = vi.fn(async () => ({ success: true }));
const getBundleMock = vi.fn();
const storeTexMock = vi.fn();
const generateReportProseMock = vi.fn();
const buildTexSourceMock = vi.fn();
const executeGetReportBundleMock = vi.fn();
const convertReportBundleToFMock = vi.fn();

vi.mock('@/lib/serverAuth', () => ({
  getServerUser: getServerUserMock,
  enforceOrigin: enforceOriginMock,
}));

vi.mock('@/lib/rateLimiter', () => ({
  reportLimiter: { limit: reportLimitMock },
}));

vi.mock('@/lib/reportStore', () => ({
  getBundle: getBundleMock,
  storeTex: storeTexMock,
}));

vi.mock('@/lib/reportProse', () => ({
  generateReportProse: generateReportProseMock,
}));

vi.mock('@/lib/reportTemplate', () => ({
  buildTexSource: buildTexSourceMock,
}));

vi.mock('@/lib/aiTools', () => ({
  executeGetReportBundle: executeGetReportBundleMock,
  convertReportBundleToF: convertReportBundleToFMock,
}));

const CONTEXT_ID = '22222222-2222-4222-8222-222222222222';

describe('/api/reports/generate route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('requires an authenticated user', async () => {
    getServerUserMock.mockResolvedValue(null);
    const { POST } = await import('./route');

    const res = await POST(new Request('http://localhost/api/reports/generate', {
      method: 'POST',
      body: JSON.stringify({ context_id: CONTEXT_ID }),
    }));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Unauthorized' });
  });

  it('rejects report contexts owned by another user before generating tex', async () => {
    getServerUserMock.mockResolvedValue({ id: 'user-1', email: 'user@example.com' });
    getBundleMock.mockResolvedValue({
      user_id: 'user-2',
      bundle: {
        has_sensor_data: true,
      },
    });
    const { POST } = await import('./route');

    const res = await POST(new Request('http://localhost/api/reports/generate', {
      method: 'POST',
      body: JSON.stringify({ context_id: CONTEXT_ID, answers: {} }),
    }));

    expect(res.status).toBe(404);
    expect(generateReportProseMock).not.toHaveBeenCalled();
    expect(buildTexSourceMock).not.toHaveBeenCalled();
    expect(storeTexMock).not.toHaveBeenCalled();
  });
});
