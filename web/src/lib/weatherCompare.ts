import { toSensorDeviceId, toWeatherDeviceId } from './weatherZip';

export function getScopedCompareDeviceIds(params: {
  deviceFilter?: string;
  deploymentDeviceId?: string;
}): string[] | null {
  const baseDevice = params.deploymentDeviceId || params.deviceFilter;
  if (!baseDevice) return null;

  const sensorDeviceId = toSensorDeviceId(baseDevice);
  const weatherDeviceId = toWeatherDeviceId(sensorDeviceId);
  return [sensorDeviceId, weatherDeviceId];
}

export function computePercentError(
  sensorValue: number | null | undefined,
  referenceValue: number | null | undefined
): number | undefined {
  if (sensorValue === null || sensorValue === undefined) return undefined;
  if (referenceValue === null || referenceValue === undefined) return undefined;

  const denominator = Math.abs(referenceValue);
  if (denominator < 1e-9) return undefined;
  return (Math.abs(sensorValue - referenceValue) / denominator) * 100;
}
