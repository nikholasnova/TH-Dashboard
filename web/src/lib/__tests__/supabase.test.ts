import { describe, expect, it } from 'vitest';
import { celsiusDeltaToFahrenheit, celsiusToFahrenheit } from '../supabase';

describe('temperature helpers', () => {
  it('converts celsius to fahrenheit', () => {
    expect(celsiusToFahrenheit(0)).toBe(32);
    expect(celsiusToFahrenheit(20)).toBe(68);
  });

  it('converts celsius delta to fahrenheit delta', () => {
    expect(celsiusDeltaToFahrenheit(10)).toBe(18);
  });
});
