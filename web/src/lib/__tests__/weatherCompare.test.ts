import { describe, expect, it } from 'vitest';
import {
  computePercentError,
  getScopedCompareDeviceIds,
} from '../weatherCompare';

describe('weatherCompare helpers', () => {
  it('returns paired sensor/weather device ids for scoped compare requests', () => {
    expect(getScopedCompareDeviceIds({})).toBeNull();
    expect(getScopedCompareDeviceIds({ deviceFilter: 'node1' })).toEqual([
      'node1',
      'weather_node1',
    ]);
    expect(
      getScopedCompareDeviceIds({ deploymentDeviceId: 'weather_node2' })
    ).toEqual(['node2', 'weather_node2']);
  });

  it('computes percent error safely', () => {
    expect(computePercentError(75, 60)).toBeCloseTo(25, 6);
    expect(computePercentError(60, 60)).toBe(0);
    expect(computePercentError(undefined, 60)).toBeUndefined();
    expect(computePercentError(60, 0)).toBeUndefined();
  });
});
