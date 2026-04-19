export type RangePreset = '1h' | '24h' | '7d' | '30d' | 'all' | 'custom';
export type SourceFilter = 'sensor' | 'weather' | 'both';

export interface FilterState {
  deviceIds: string[];
  rangePreset: RangePreset;
  customStart: string;
  customEnd: string;
  minTempF: string;
  maxTempF: string;
  minHumidity: string;
  maxHumidity: string;
  source: SourceFilter;
  deploymentId: number | null;
  anomaliesOnly: boolean;
}

export const DEFAULT_FILTER: FilterState = {
  deviceIds: [],
  rangePreset: '24h',
  customStart: '',
  customEnd: '',
  minTempF: '',
  maxTempF: '',
  minHumidity: '',
  maxHumidity: '',
  source: 'sensor',
  deploymentId: null,
  anomaliesOnly: false,
};

export function resolveRange(state: FilterState): { start: string; end: string } {
  if (state.rangePreset === 'custom' && state.customStart && state.customEnd) {
    return {
      start: new Date(state.customStart).toISOString(),
      end: new Date(state.customEnd).toISOString(),
    };
  }
  const now = Date.now();
  if (state.rangePreset === 'all') {
    return {
      start: new Date(0).toISOString(),
      end: new Date(now).toISOString(),
    };
  }
  const hours =
    state.rangePreset === '1h' ? 1
    : state.rangePreset === '24h' ? 24
    : state.rangePreset === '7d' ? 24 * 7
    : state.rangePreset === '30d' ? 24 * 30
    : 24;
  return {
    start: new Date(now - hours * 3600 * 1000).toISOString(),
    end: new Date(now).toISOString(),
  };
}

export function parseNumberInput(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function fahrenheitToCelsius(f: number): number {
  return ((f - 32) * 5) / 9;
}

export interface NLFilterResponse {
  deviceIds?: string[];
  rangePreset?: RangePreset;
  customStart?: string;
  customEnd?: string;
  minTempF?: number | null;
  maxTempF?: number | null;
  minHumidity?: number | null;
  maxHumidity?: number | null;
  source?: SourceFilter;
  anomaliesOnly?: boolean;
}
