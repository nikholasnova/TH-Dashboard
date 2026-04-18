import type { Reading } from './supabase';
import { celsiusToFahrenheit } from './supabase';

export interface AnomalyFlag {
  reading: Reading;
  tempDeltaF: number;
  humDelta: number;
  reason: 'temp-spike' | 'hum-spike';
}

const TEMP_THRESHOLD_F = 10;
const HUM_THRESHOLD = 15;

// DHT20 physical operating range: -40 to +80°C (-40 to 176°F).
// Anything outside this is a hardware glitch regardless of neighbor values —
// catches stuck spikes that last multiple consecutive readings.
const TEMP_MAX_F = 176;
const TEMP_MIN_F = -40;
const HUM_MAX = 100;
const HUM_MIN = 0;

function isImpossibleTemp(r: Reading): boolean {
  const f = celsiusToFahrenheit(r.temperature);
  return f > TEMP_MAX_F || f < TEMP_MIN_F;
}

function isImpossibleHum(r: Reading): boolean {
  return r.humidity > HUM_MAX || r.humidity < HUM_MIN;
}

function flagDeviceSeries(readings: Reading[]): AnomalyFlag[] {
  const asc = [...readings].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const flags: AnomalyFlag[] = [];

  const neighborDelta = (i: number, getValue: (r: Reading) => number): { prev: number | null; next: number | null } => {
    const curr = getValue(asc[i]);
    return {
      prev: i > 0 ? curr - getValue(asc[i - 1]) : null,
      next: i < asc.length - 1 ? curr - getValue(asc[i + 1]) : null,
    };
  };

  const chooseSmaller = (a: number | null, b: number | null): number =>
    a == null ? (b ?? 0) : b == null ? a : Math.abs(a) < Math.abs(b) ? a : b;

  for (let i = 0; i < asc.length; i++) {
    const curr = asc[i];
    const tempD = neighborDelta(i, (r) => celsiusToFahrenheit(r.temperature));
    const humD = neighborDelta(i, (r) => r.humidity);

    const tempSpikeByNeighbors =
      tempD.prev != null &&
      tempD.next != null &&
      Math.abs(tempD.prev) > TEMP_THRESHOLD_F &&
      Math.abs(tempD.next) > TEMP_THRESHOLD_F &&
      Math.sign(tempD.prev) === Math.sign(tempD.next);

    const humSpikeByNeighbors =
      humD.prev != null &&
      humD.next != null &&
      Math.abs(humD.prev) > HUM_THRESHOLD &&
      Math.abs(humD.next) > HUM_THRESHOLD &&
      Math.sign(humD.prev) === Math.sign(humD.next);

    const tempImpossible = isImpossibleTemp(curr);
    const humImpossible = isImpossibleHum(curr);

    if (tempSpikeByNeighbors || tempImpossible) {
      flags.push({
        reading: curr,
        tempDeltaF: chooseSmaller(tempD.prev, tempD.next),
        humDelta: chooseSmaller(humD.prev, humD.next),
        reason: 'temp-spike',
      });
    } else if (humSpikeByNeighbors || humImpossible) {
      flags.push({
        reading: curr,
        tempDeltaF: chooseSmaller(tempD.prev, tempD.next),
        humDelta: chooseSmaller(humD.prev, humD.next),
        reason: 'hum-spike',
      });
    }
  }
  return flags;
}

export function flagAnomalies(readings: Reading[]): Map<number, AnomalyFlag> {
  const byDevice = new Map<string, Reading[]>();
  for (const r of readings) {
    if (r.source === 'weather') continue;
    const list = byDevice.get(r.device_id);
    if (list) list.push(r);
    else byDevice.set(r.device_id, [r]);
  }

  const flags = new Map<number, AnomalyFlag>();
  for (const deviceReadings of byDevice.values()) {
    for (const flag of flagDeviceSeries(deviceReadings)) {
      flags.set(flag.reading.id, flag);
    }
  }
  return flags;
}
