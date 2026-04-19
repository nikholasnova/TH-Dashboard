import {
  DEPLOYMENT_ALL_TIME_HOURS,
  DEPLOYMENT_ALL_TIME_LABEL,
  TIME_RANGES,
} from '@/lib/constants';
import { SegmentedNav } from './SegmentedNav';

interface TimeRangeSelectorProps {
  selectedRange: number;
  onRangeChange: (hours: number) => void;
  showDeploymentAllTime?: boolean;
}

export function TimeRangeSelector({
  selectedRange,
  onRangeChange,
  showDeploymentAllTime = false,
}: TimeRangeSelectorProps) {
  const ranges = showDeploymentAllTime
    ? [
      ...TIME_RANGES.slice(0, -1),
      { label: DEPLOYMENT_ALL_TIME_LABEL, hours: DEPLOYMENT_ALL_TIME_HOURS },
      TIME_RANGES[TIME_RANGES.length - 1],
    ]
    : TIME_RANGES;

  return (
    <SegmentedNav
      layoutGroupId="time-range"
      value={selectedRange}
      onChange={onRangeChange}
      options={ranges.map((r) => ({ value: r.hours, label: r.label }))}
    />
  );
}
