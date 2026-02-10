import { celsiusToFahrenheit, celsiusDeltaToFahrenheit } from './supabase';

const DASH = '—';

export function safeC2F(celsius: number | null | undefined): number | undefined {
  return celsius != null ? celsiusToFahrenheit(celsius) : undefined;
}

export function safeDeltaC2F(delta: number | null | undefined): number | undefined {
  return delta != null ? celsiusDeltaToFahrenheit(delta) : undefined;
}

export function formatValue(
  value: number | null | undefined,
  decimals = 1
): string {
  if (value == null) return DASH;
  return value.toFixed(decimals);
}

export function formatDelta(
  a: number | null | undefined,
  b: number | null | undefined,
  decimals = 1
): string {
  if (a == null || b == null) return DASH;
  const delta = a - b;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(decimals)}`;
}

export function formatPercent(
  value: number | null | undefined,
  decimals = 1
): string {
  if (value == null) return DASH;
  return `${value.toFixed(decimals)}%`;
}

export function formatPercentDelta(
  a: number | null | undefined,
  b: number | null | undefined,
  decimals = 1
): string {
  if (a == null || b == null) return DASH;
  const delta = a - b;
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(decimals)}%`;
}

export function formatTempF(
  fahrenheit: number | null | undefined,
  decimals = 1
): string {
  if (fahrenheit == null) return DASH;
  return `${fahrenheit.toFixed(decimals)}°F`;
}

export function formatTempC(
  celsius: number | null | undefined,
  decimals = 1
): string {
  if (celsius == null) return DASH;
  return `${celsius.toFixed(decimals)}°C`;
}
