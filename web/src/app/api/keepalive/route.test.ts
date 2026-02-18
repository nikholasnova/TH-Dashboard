// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import {
  minutesSince,
  classifyDevice,
  shouldSendProblemAlert,
  shouldSendRecoveryAlert,
  parseDeviceList,
  parseNumberEnv,
} from './route';

type DeviceAlertState = {
  device_id: string;
  status: 'ok' | 'missing' | 'stale' | 'anomaly';
  last_seen_at: string | null;
  last_alert_type: string | null;
  last_alert_sent_at: string | null;
  last_recovery_sent_at: string | null;
  updated_at: string;
};

function makeState(overrides: Partial<DeviceAlertState> = {}): DeviceAlertState {
  return {
    device_id: 'node1',
    status: 'ok',
    last_seen_at: null,
    last_alert_type: null,
    last_alert_sent_at: null,
    last_recovery_sent_at: null,
    updated_at: '',
    ...overrides,
  };
}

describe('minutesSince', () => {
  const NOW = new Date('2026-02-10T12:00:00Z').getTime();

  it('returns null for null input', () => {
    expect(minutesSince(null, NOW)).toBeNull();
  });

  it('returns null for invalid date string', () => {
    expect(minutesSince('not-a-date', NOW)).toBeNull();
  });

  it('calculates minutes correctly', () => {
    const fiveMinAgo = new Date(NOW - 5 * 60_000).toISOString();
    expect(minutesSince(fiveMinAgo, NOW)).toBeCloseTo(5, 1);
  });

  it('returns 0 for future dates (clamped)', () => {
    const future = new Date(NOW + 60_000).toISOString();
    expect(minutesSince(future, NOW)).toBe(0);
  });

  it('returns 0 for exact now', () => {
    const now = new Date(NOW).toISOString();
    expect(minutesSince(now, NOW)).toBeCloseTo(0, 1);
  });
});

describe('classifyDevice', () => {
  const NOW = new Date('2026-02-10T12:00:00Z').getTime();
  const STALE_MINUTES = 10;

  it('returns missing when no readings exist', () => {
    const result = classifyDevice(null, STALE_MINUTES, NOW);
    expect(result.status).toBe('missing');
    expect(result.ageMinutes).toBeNull();
  });

  it('returns ok for fresh, normal reading', () => {
    const reading = { created_at: new Date(NOW - 60_000).toISOString(), temperature: 25, humidity: 50 };
    const result = classifyDevice(reading, STALE_MINUTES, NOW);
    expect(result.status).toBe('ok');
    expect(result.ageMinutes).toBeCloseTo(1, 1);
  });

  it('returns stale when reading age exceeds threshold', () => {
    const reading = { created_at: new Date(NOW - 15 * 60_000).toISOString(), temperature: 25, humidity: 50 };
    const result = classifyDevice(reading, STALE_MINUTES, NOW);
    expect(result.status).toBe('stale');
    expect(result.reason).toContain('15.0');
    expect(result.reason).toContain('threshold: 10');
  });

  it('returns stale at exact threshold + 1ms', () => {
    const justOver = new Date(NOW - (STALE_MINUTES * 60_000 + 1)).toISOString();
    const result = classifyDevice({ created_at: justOver, temperature: 25, humidity: 50 }, STALE_MINUTES, NOW);
    expect(result.status).toBe('stale');
  });

  it('returns ok at exact threshold', () => {
    const atThreshold = new Date(NOW - STALE_MINUTES * 60_000).toISOString();
    const result = classifyDevice({ created_at: atThreshold, temperature: 25, humidity: 50 }, STALE_MINUTES, NOW);
    expect(result.status).toBe('ok');
  });

  it('returns anomaly for temperature below -40C', () => {
    const reading = { created_at: new Date(NOW - 60_000).toISOString(), temperature: -41, humidity: 50 };
    const result = classifyDevice(reading, STALE_MINUTES, NOW);
    expect(result.status).toBe('anomaly');
    expect(result.reason).toContain('-41.00');
  });

  it('returns anomaly for temperature above 85C', () => {
    const reading = { created_at: new Date(NOW - 60_000).toISOString(), temperature: 86, humidity: 50 };
    const result = classifyDevice(reading, STALE_MINUTES, NOW);
    expect(result.status).toBe('anomaly');
  });

  it('returns anomaly for humidity below 0', () => {
    const reading = { created_at: new Date(NOW - 60_000).toISOString(), temperature: 25, humidity: -1 };
    const result = classifyDevice(reading, STALE_MINUTES, NOW);
    expect(result.status).toBe('anomaly');
  });

  it('returns anomaly for humidity above 100', () => {
    const reading = { created_at: new Date(NOW - 60_000).toISOString(), temperature: 25, humidity: 101 };
    const result = classifyDevice(reading, STALE_MINUTES, NOW);
    expect(result.status).toBe('anomaly');
  });

  it('accepts boundary values as ok (-40C, 85C, 0%, 100%)', () => {
    expect(classifyDevice({ created_at: new Date(NOW).toISOString(), temperature: -40, humidity: 0 }, STALE_MINUTES, NOW).status).toBe('ok');
    expect(classifyDevice({ created_at: new Date(NOW).toISOString(), temperature: 85, humidity: 100 }, STALE_MINUTES, NOW).status).toBe('ok');
  });

  it('checks staleness before anomaly', () => {
    const reading = { created_at: new Date(NOW - 20 * 60_000).toISOString(), temperature: 200, humidity: 200 };
    const result = classifyDevice(reading, STALE_MINUTES, NOW);
    expect(result.status).toBe('stale');
  });
});

describe('shouldSendProblemAlert', () => {
  it('sends alert when no previous state exists', () => {
    expect(shouldSendProblemAlert(undefined, 'stale')).toBe(true);
  });

  it('sends alert on transition from ok to problem', () => {
    expect(shouldSendProblemAlert(makeState({ status: 'ok' }), 'stale')).toBe(true);
  });

  it('sends alert on status type change (stale → anomaly)', () => {
    expect(shouldSendProblemAlert(
      makeState({ status: 'stale', last_alert_sent_at: '2026-01-01T00:00:00Z' }),
      'anomaly'
    )).toBe(true);
  });

  it('skips alert when same problem and alert was already sent', () => {
    expect(shouldSendProblemAlert(
      makeState({ status: 'stale', last_alert_sent_at: '2026-01-01T00:00:00Z' }),
      'stale'
    )).toBe(false);
  });

  it('sends alert when same problem and no prior attempt was made', () => {
    expect(shouldSendProblemAlert(
      makeState({ status: 'stale', last_alert_sent_at: null }),
      'stale'
    )).toBe(true);
  });

  it('sends alert on transition from missing to stale', () => {
    expect(shouldSendProblemAlert(makeState({ status: 'missing' }), 'stale')).toBe(true);
  });
});

describe('shouldSendRecoveryAlert', () => {
  it('returns false when recovery is disabled', () => {
    expect(shouldSendRecoveryAlert(makeState({ status: 'stale' }), false)).toBe(false);
  });

  it('returns false when no previous state exists', () => {
    expect(shouldSendRecoveryAlert(undefined, true)).toBe(false);
  });

  it('returns true on transition from stale to ok', () => {
    expect(shouldSendRecoveryAlert(makeState({ status: 'stale' }), true)).toBe(true);
  });

  it('returns true on transition from anomaly to ok', () => {
    expect(shouldSendRecoveryAlert(makeState({ status: 'anomaly' }), true)).toBe(true);
  });

  it('returns true on transition from missing to ok', () => {
    expect(shouldSendRecoveryAlert(makeState({ status: 'missing' }), true)).toBe(true);
  });

  it('returns false when previous was already ok', () => {
    expect(shouldSendRecoveryAlert(makeState({ status: 'ok' }), true)).toBe(false);
  });
});

describe('parseDeviceList', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns default devices when env is unset', () => {
    delete process.env.MONITORED_DEVICE_IDS;
    expect(parseDeviceList()).toEqual(['node1', 'node2']);
  });

  it('parses comma-separated list', () => {
    process.env.MONITORED_DEVICE_IDS = 'sensor_a, sensor_b, sensor_c';
    expect(parseDeviceList()).toEqual(['sensor_a', 'sensor_b', 'sensor_c']);
  });

  it('returns defaults for empty string', () => {
    process.env.MONITORED_DEVICE_IDS = '';
    expect(parseDeviceList()).toEqual(['node1', 'node2']);
  });

  it('returns defaults for whitespace-only', () => {
    process.env.MONITORED_DEVICE_IDS = '  ,  , ';
    expect(parseDeviceList()).toEqual(['node1', 'node2']);
  });
});

describe('parseNumberEnv', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns fallback when env is unset', () => {
    delete process.env.TEST_NUM;
    expect(parseNumberEnv('TEST_NUM', 42)).toBe(42);
  });

  it('parses valid number', () => {
    process.env.TEST_NUM = '15';
    expect(parseNumberEnv('TEST_NUM', 42)).toBe(15);
  });

  it('returns fallback for non-numeric string', () => {
    process.env.TEST_NUM = 'abc';
    expect(parseNumberEnv('TEST_NUM', 42)).toBe(42);
  });

  it('returns fallback for zero', () => {
    process.env.TEST_NUM = '0';
    expect(parseNumberEnv('TEST_NUM', 42)).toBe(42);
  });

  it('returns fallback for negative number', () => {
    process.env.TEST_NUM = '-5';
    expect(parseNumberEnv('TEST_NUM', 42)).toBe(42);
  });

  it('returns fallback for Infinity', () => {
    process.env.TEST_NUM = 'Infinity';
    expect(parseNumberEnv('TEST_NUM', 42)).toBe(42);
  });
});
