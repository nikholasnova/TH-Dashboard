const US_ZIP_CODE_PATTERN = /^\d{5}(?:-\d{4})?$/;

/**
 * Returns a trimmed US zip code (ZIP or ZIP+4) when valid, otherwise null.
 */
export function normalizeUsZipCode(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return US_ZIP_CODE_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * Empty input is considered valid for optional fields.
 */
export function isValidOptionalUsZipCode(value: string): boolean {
  if (!value.trim()) return true;
  return normalizeUsZipCode(value) !== null;
}

export function toWeatherDeviceId(deviceId: string): string {
  return deviceId.startsWith('weather_') ? deviceId : `weather_${deviceId}`;
}

export function toSensorDeviceId(deviceId: string): string {
  return deviceId.startsWith('weather_') ? deviceId.slice('weather_'.length) : deviceId;
}
