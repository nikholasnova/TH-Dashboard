import { describe, expect, it, vi } from 'vitest';
import { executeTool } from '../aiTools';

vi.mock('../supabase', () => {
    return {
        getDeployments: vi.fn(async () => [{ id: 1, name: 'Lab', device_id: 'node1', location: 'Room A' }]),
        getDeploymentStats: vi.fn(async () => [{
            deployment_id: 1,
            deployment_name: 'Lab',
            device_id: 'node1',
            location: 'Room A',
            temp_avg: 20,
            temp_min: 18,
            temp_max: 22,
            temp_stddev: 1,
            humidity_avg: 45,
            humidity_min: 40,
            humidity_max: 50,
            humidity_stddev: 2,
            reading_count: 100,
        }]),
        getDeploymentReadings: vi.fn(async () => [{
            id: 1,
            device_id: 'node1',
            temperature: 20,
            humidity: 45,
            created_at: new Date().toISOString(),
        }]),
        celsiusToFahrenheit: (c: number) => (c * 9) / 5 + 32,
    };
});

describe('executeTool', () => {
    it('converts deployment stats to fahrenheit', async () => {
        const result = await executeTool('get_deployment_stats', { deployment_ids: [1] });
        expect(Array.isArray(result)).toBe(true);
        const stats = (result as Array<Record<string, number>>)[0];
        expect(stats.temp_avg_f).toBe(68);
        expect(stats.temp_min_f).toBe(64.4);
        expect(stats.temp_max_f).toBe(71.6);
    });

    it('converts readings to fahrenheit', async () => {
        const result = await executeTool('get_readings', { deployment_id: 1 });
        const readings = result as Array<Record<string, number>>;
        expect(readings[0].temperature_f).toBe(68);
    });

    it('throws on unknown tool', async () => {
        await expect(executeTool('unknown_tool', {})).rejects.toThrow('Unknown tool');
    });
});
