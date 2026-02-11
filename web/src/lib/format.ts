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

export function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function getTimeAgo(dateString: string): string {
  const now = new Date();
  const date = new Date(dateString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
  if (diffHours > 0) return diffHours === 1 ? '1 hour ago' : `${diffHours} hours ago`;
  if (diffMins > 0) return diffMins === 1 ? '1 min ago' : `${diffMins} mins ago`;
  return 'just now';
}
