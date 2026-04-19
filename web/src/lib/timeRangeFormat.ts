import {
  DEPLOYMENT_ALL_TIME_HOURS,
  DEPLOYMENT_ALL_TIME_LABEL,
  TIME_RANGES,
} from './constants';

export function formatRangeLabel(selectedRange: number): string {
  if (selectedRange === DEPLOYMENT_ALL_TIME_HOURS) return DEPLOYMENT_ALL_TIME_LABEL;
  return TIME_RANGES.find((r) => r.hours === selectedRange)?.label || `${selectedRange}h`;
}
