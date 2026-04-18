import { describe, expect, it } from 'vitest';
import type { Reading } from '../supabase';
import { flagAnomalies } from '../anomalies';

function makeReading(overrides: Partial<Reading> & { temperature: number; humidity: number }, i = 0): Reading {
  return {
    id: i,
    device_id: 'node1',
    created_at: new Date(2026, 3, 18, 12, i).toISOString(),
    source: 'sensor',
    ...overrides,
  };
}

describe('flagAnomalies (neighbor delta)', () => {
  it('flags a single-row temperature spike surrounded by normal readings', () => {
    const readings = [
      makeReading({ id: 1, temperature: 28, humidity: 10 }, 0),
      makeReading({ id: 2, temperature: 28.2, humidity: 10 }, 1),
      makeReading({ id: 3, temperature: 119.69, humidity: 78 }, 2),
      makeReading({ id: 4, temperature: 28.3, humidity: 10 }, 3),
      makeReading({ id: 5, temperature: 28.1, humidity: 10 }, 4),
    ];
    const flags = flagAnomalies(readings);
    expect(flags.size).toBe(1);
    expect(flags.get(3)?.reason).toBe('temp-spike');
    expect(Math.abs(flags.get(3)!.tempDeltaF)).toBeGreaterThan(10);
  });

  it('does not flag gradual temperature drift', () => {
    const readings = Array.from({ length: 10 }, (_, i) =>
      makeReading({ temperature: 25 + i * 0.3, humidity: 45 }, i),
    );
    expect(flagAnomalies(readings).size).toBe(0);
  });

  it('does not flag edge readings on the neighbor rule alone (within physical bounds)', () => {
    // 40°C is a big delta from 28°C but within DHT20 range, so no
    // physical-bounds flag — edge readings only have one neighbor so the
    // same-sign rule can't apply.
    const readings = [
      makeReading({ id: 1, temperature: 40, humidity: 10 }, 0),
      makeReading({ id: 2, temperature: 28, humidity: 10 }, 1),
      makeReading({ id: 3, temperature: 28, humidity: 10 }, 2),
      makeReading({ id: 4, temperature: 40, humidity: 10 }, 3),
    ];
    expect(flagAnomalies(readings).size).toBe(0);
  });

  it('flags humidity spikes too', () => {
    const readings = [
      makeReading({ id: 1, temperature: 28, humidity: 10 }, 0),
      makeReading({ id: 2, temperature: 28, humidity: 78 }, 1),
      makeReading({ id: 3, temperature: 28, humidity: 11 }, 2),
    ];
    const flags = flagAnomalies(readings);
    expect(flags.size).toBe(1);
    expect(flags.get(2)?.reason).toBe('hum-spike');
  });

  it('does not flag a reading inside a step change', () => {
    // Genuine shift: temp goes from 25 to 40 and stays. The 40 shouldn't flag
    // because only one side has a large delta.
    const readings = [
      makeReading({ id: 1, temperature: 25, humidity: 10 }, 0),
      makeReading({ id: 2, temperature: 25, humidity: 10 }, 1),
      makeReading({ id: 3, temperature: 40, humidity: 10 }, 2),
      makeReading({ id: 4, temperature: 40, humidity: 10 }, 3),
      makeReading({ id: 5, temperature: 40, humidity: 10 }, 4),
    ];
    expect(flagAnomalies(readings).size).toBe(0);
  });

  it('requires both neighbor deltas on the same side (spike, not ramp through)', () => {
    // 25 → 36 → 47: reading 36 is >10F from 25 but the NEXT reading (47) is
    // going in the same direction as the previous delta. 36 vs 47 is -11 (same
    // sign as 36 vs 25 reversed). Should NOT flag — this is a monotonic ramp.
    const readings = [
      makeReading({ id: 1, temperature: 25, humidity: 10 }, 0),
      makeReading({ id: 2, temperature: 36, humidity: 10 }, 1),
      makeReading({ id: 3, temperature: 47, humidity: 10 }, 2),
      makeReading({ id: 4, temperature: 25, humidity: 10 }, 3),
    ];
    const flags = flagAnomalies(readings);
    expect(flags.has(2)).toBe(false);
  });

  it('flags stuck-high temperature spikes via physical bounds even without contrasting neighbors', () => {
    // Two consecutive readings at 302°F — neighbor rule alone misses them
    // because each row's immediate neighbor is also bad. The physical-bound
    // check catches them regardless.
    const readings = [
      makeReading({ id: 1, temperature: 28, humidity: 40 }, 0),
      makeReading({ id: 2, temperature: 150, humidity: 100 }, 1),
      makeReading({ id: 3, temperature: 150, humidity: 100 }, 2),
      makeReading({ id: 4, temperature: 28, humidity: 40 }, 3),
    ];
    const flags = flagAnomalies(readings);
    expect(flags.has(2)).toBe(true);
    expect(flags.has(3)).toBe(true);
    expect(flags.get(2)?.reason).toBe('temp-spike');
  });

  it('flags a physically impossible reading at the edge of the series', () => {
    // Even as the last reading (no next neighbor), 200°F is flagged by bounds.
    const readings = [
      makeReading({ id: 1, temperature: 28, humidity: 40 }, 0),
      makeReading({ id: 2, temperature: 28, humidity: 40 }, 1),
      makeReading({ id: 3, temperature: 95, humidity: 40 }, 2),
    ];
    const flags = flagAnomalies(readings);
    expect(flags.has(3)).toBe(true);
  });

  it('ignores weather rows', () => {
    const sensor = [
      makeReading({ id: 1, temperature: 28, humidity: 10 }, 0),
      makeReading({ id: 2, temperature: 28, humidity: 10 }, 1),
      makeReading({ id: 3, temperature: 28, humidity: 10 }, 2),
    ];
    const weather = [
      makeReading({ id: 10, temperature: -15, humidity: 99, source: 'weather', device_id: 'weather_node1' }, 10),
      makeReading({ id: 11, temperature: 22, humidity: 40, source: 'weather', device_id: 'weather_node1' }, 11),
      makeReading({ id: 12, temperature: -15, humidity: 99, source: 'weather', device_id: 'weather_node1' }, 12),
    ];
    const flags = flagAnomalies([...sensor, ...weather]);
    expect(flags.has(11)).toBe(false);
  });
});
