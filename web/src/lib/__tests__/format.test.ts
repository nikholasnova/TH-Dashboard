import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import {
  safeC2F,
  safeDeltaC2F,
  formatValue,
  formatDelta,
  formatPercent,
  formatPercentDelta,
  formatTempF,
  formatTempC,
  formatTime,
  formatDate,
  getTimeAgo,
} from '../format';

const DASH = '\u2014';

describe('safeC2F', () => {
  it('converts 0C to 32F', () => expect(safeC2F(0)).toBe(32));
  it('converts 100C to 212F', () => expect(safeC2F(100)).toBe(212));
  it('converts negative temperatures', () => expect(safeC2F(-40)).toBe(-40));
  it('returns undefined for null', () => expect(safeC2F(null)).toBeUndefined());
  it('returns undefined for undefined', () => expect(safeC2F(undefined)).toBeUndefined());
});

describe('safeDeltaC2F', () => {
  it('converts delta (multiply by 9/5 only, no +32)', () => expect(safeDeltaC2F(1)).toBeCloseTo(1.8));
  it('converts 0 delta to 0', () => expect(safeDeltaC2F(0)).toBeCloseTo(0));
  it('converts negative delta', () => expect(safeDeltaC2F(-5)).toBeCloseTo(-9));
  it('returns undefined for null', () => expect(safeDeltaC2F(null)).toBeUndefined());
  it('returns undefined for undefined', () => expect(safeDeltaC2F(undefined)).toBeUndefined());
});

describe('formatValue', () => {
  it('formats a number with 1 decimal by default', () => expect(formatValue(23.456)).toBe('23.5'));
  it('formats with custom decimals', () => expect(formatValue(23.456, 2)).toBe('23.46'));
  it('formats zero', () => expect(formatValue(0)).toBe('0.0'));
  it('formats negative values', () => expect(formatValue(-3.14)).toBe('-3.1'));
  it('returns dash for null', () => expect(formatValue(null)).toBe(DASH));
  it('returns dash for undefined', () => expect(formatValue(undefined)).toBe(DASH));
});

describe('formatDelta', () => {
  it('shows positive delta with + sign', () => expect(formatDelta(30, 25)).toBe('+5.0'));
  it('shows negative delta without extra sign', () => expect(formatDelta(20, 25)).toBe('-5.0'));
  it('shows zero delta as +0.0', () => expect(formatDelta(25, 25)).toBe('+0.0'));
  it('returns dash when first value is null', () => expect(formatDelta(null, 25)).toBe(DASH));
  it('returns dash when second value is null', () => expect(formatDelta(25, null)).toBe(DASH));
  it('returns dash when both are null', () => expect(formatDelta(null, null)).toBe(DASH));
  it('respects custom decimals', () => expect(formatDelta(10.123, 10, 2)).toBe('+0.12'));
});

describe('formatPercent', () => {
  it('formats with percent sign', () => expect(formatPercent(50)).toBe('50.0%'));
  it('formats zero', () => expect(formatPercent(0)).toBe('0.0%'));
  it('returns dash for null', () => expect(formatPercent(null)).toBe(DASH));
  it('returns dash for undefined', () => expect(formatPercent(undefined)).toBe(DASH));
});

describe('formatPercentDelta', () => {
  it('shows positive delta with + and %', () => expect(formatPercentDelta(60, 50)).toBe('+10.0%'));
  it('shows negative delta with %', () => expect(formatPercentDelta(40, 50)).toBe('-10.0%'));
  it('returns dash when a value is null', () => expect(formatPercentDelta(null, 50)).toBe(DASH));
});

describe('formatTempF', () => {
  it('formats with degree F', () => expect(formatTempF(72)).toBe('72.0°F'));
  it('formats negative temp', () => expect(formatTempF(-10)).toBe('-10.0°F'));
  it('formats with custom decimals', () => expect(formatTempF(72.456, 2)).toBe('72.46°F'));
  it('returns dash for null', () => expect(formatTempF(null)).toBe(DASH));
  it('returns dash for undefined', () => expect(formatTempF(undefined)).toBe(DASH));
});

describe('formatTempC', () => {
  it('formats with degree C', () => expect(formatTempC(25)).toBe('25.0°C'));
  it('returns dash for null', () => expect(formatTempC(null)).toBe(DASH));
  it('returns dash for undefined', () => expect(formatTempC(undefined)).toBe(DASH));
});

describe('formatTime', () => {
  it('returns a time string with hours and minutes', () => {
    const result = formatTime('2026-02-10T14:30:00Z');
    expect(result).toMatch(/\d{1,2}:\d{2}/);
  });
});

describe('formatDate', () => {
  it('returns a short date with month and day', () => {
    const result = formatDate('2026-02-10T14:30:00Z');
    expect(result).toMatch(/Feb\s+10/);
  });
});

describe('getTimeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-10T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for very recent', () => {
    expect(getTimeAgo('2026-02-10T12:00:00Z')).toBe('just now');
  });

  it('returns "1 min ago" for 1 minute', () => {
    expect(getTimeAgo('2026-02-10T11:59:00Z')).toBe('1 min ago');
  });

  it('returns plural mins', () => {
    expect(getTimeAgo('2026-02-10T11:55:00Z')).toBe('5 mins ago');
  });

  it('returns "1 hour ago" for 1 hour', () => {
    expect(getTimeAgo('2026-02-10T11:00:00Z')).toBe('1 hour ago');
  });

  it('returns plural hours', () => {
    expect(getTimeAgo('2026-02-10T09:00:00Z')).toBe('3 hours ago');
  });

  it('returns "1 day ago" for 1 day', () => {
    expect(getTimeAgo('2026-02-09T12:00:00Z')).toBe('1 day ago');
  });

  it('returns plural days', () => {
    expect(getTimeAgo('2026-02-07T12:00:00Z')).toBe('3 days ago');
  });
});
