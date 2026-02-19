import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({
  getDeployments: vi.fn(),
  getDeploymentReadings: vi.fn(),
  getChartSamples: vi.fn(),
  celsiusToFahrenheit: (celsius: number) => (celsius * 9) / 5 + 32,
}));

import { runAnalyses } from '../analysisRunner';
import { getDeployments, getDeploymentReadings } from '../supabase';

function makePyodideStub() {
  const globals = new Map<string, unknown>();
  return {
    globals: {
      set(key: string, value: unknown) {
        globals.set(key, value);
      },
      get(key: string) {
        return globals.get(key);
      },
    },
    runPythonAsync: vi.fn(async (script: string) => {
      if (script.includes('result_json')) {
        globals.set('result_json', '[]');
      }
    }),
  };
}

describe('runAnalyses forecasting data scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses full deployment history for forecasting without row cap', async () => {
    const deployments = [
      {
        id: 1,
        device_id: 'node1',
        name: 'Deployment A',
        location: 'Yard',
        notes: null,
        zip_code: '85142',
        started_at: '2025-01-01T00:00:00.000Z',
        ended_at: null,
        created_at: '2025-01-01T00:00:00.000Z',
        reading_count: 10000,
      },
    ];

    vi.mocked(getDeployments).mockResolvedValue(deployments);
    vi.mocked(getDeploymentReadings).mockResolvedValue([]);

    const pyodide = makePyodideStub();

    await runAnalyses(
      pyodide as never,
      {
        deploymentIds: [1],
        start: '2026-02-01T00:00:00.000Z',
        end: '2000-01-01T00:00:00.000Z',
        analyses: ['forecasting'],
      }
    );

    expect(getDeploymentReadings).toHaveBeenCalledTimes(1);
    const call = vi.mocked(getDeploymentReadings).mock.calls[0];
    expect(call?.[0]).toBe(1);
    expect(call?.[1]).toBeUndefined();
    expect(call?.[2]).toMatchObject({
      start: '2025-01-01T00:00:00.000Z',
      preferLatest: false,
    });
    expect(typeof call?.[2]?.end).toBe('string');
    expect(call?.[2]?.end).not.toBe('2000-01-01T00:00:00.000Z');
  });
});
