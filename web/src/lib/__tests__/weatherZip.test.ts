import { describe, expect, it } from 'vitest';
import {
  isValidOptionalUsZipCode,
  normalizeUsZipCode,
  toSensorDeviceId,
  toWeatherDeviceId,
} from '../weatherZip';

describe('weatherZip helpers', () => {
  it('normalizes valid US zip codes', () => {
    expect(normalizeUsZipCode(' 85142 ')).toBe('85142');
    expect(normalizeUsZipCode('85001-1234')).toBe('85001-1234');
  });

  it('rejects invalid zip values', () => {
    expect(normalizeUsZipCode('')).toBeNull();
    expect(normalizeUsZipCode('abcde')).toBeNull();
    expect(normalizeUsZipCode('1234')).toBeNull();
    expect(normalizeUsZipCode(null)).toBeNull();
  });

  it('allows optional empty zip input', () => {
    expect(isValidOptionalUsZipCode('')).toBe(true);
    expect(isValidOptionalUsZipCode('   ')).toBe(true);
    expect(isValidOptionalUsZipCode('85142')).toBe(true);
    expect(isValidOptionalUsZipCode('bad-zip')).toBe(false);
  });

  it('converts between sensor/weather device ids', () => {
    expect(toWeatherDeviceId('node1')).toBe('weather_node1');
    expect(toWeatherDeviceId('weather_node2')).toBe('weather_node2');
    expect(toSensorDeviceId('weather_node1')).toBe('node1');
    expect(toSensorDeviceId('node2')).toBe('node2');
  });
});
