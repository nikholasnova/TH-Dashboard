import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabase', () => ({
  getDeployments: vi.fn(),
  getDeploymentReadings: vi.fn(),
  getChartSamples: vi.fn(),
  celsiusToFahrenheit: (celsius: number) => (celsius * 9) / 5 + 32,
}));

import { aggregateHourlyForecastToDaily, runAnalyses } from '../analysisRunner';
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

describe('aggregateHourlyForecastToDaily', () => {
  it('skips partial days and returns 7 full forecast days', () => {
    const timestamps: string[] = [];
    const values: number[] = [];

    for (let hour = 15; hour <= 23; hour++) {
      timestamps.push(`2026-02-10T${String(hour).padStart(2, '0')}:00:00.000Z`);
      values.push(hour);
    }

    for (let day = 11; day <= 17; day++) {
      for (let hour = 0; hour <= 23; hour++) {
        timestamps.push(`2026-02-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:00:00.000Z`);
        values.push(hour);
      }
    }

    for (let hour = 0; hour <= 5; hour++) {
      timestamps.push(`2026-02-18T${String(hour).padStart(2, '0')}:00:00.000Z`);
      values.push(hour);
    }

    const days = aggregateHourlyForecastToDaily(
      { timestamps, values },
      new Date('2026-02-10T16:00:00.000Z')
    );

    expect(days).toHaveLength(7);
    expect(days[0].date).toBe('2026-02-11');
    expect(days[6].date).toBe('2026-02-17');
    expect(days.every((d) => d.temp_low_f === 0 && d.temp_high_f === 23)).toBe(true);
  });
});

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
