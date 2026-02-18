import {
  DEPLOYMENT_ALL_TIME_HOURS,
  DEPLOYMENT_ALL_TIME_LABEL,
  TIME_RANGES,
} from '@/lib/constants';

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
    <div className="glass-card p-2 flex gap-1">
      {ranges.map((range) => (
        <button
          key={range.hours}
          onClick={() => onRangeChange(range.hours)}
          className={`px-5 py-2.5 text-sm rounded-xl transition-all ${
            selectedRange === range.hours
              ? 'nav-active text-white font-semibold'
              : 'text-[#a0aec0] hover:text-white hover:bg-white/5'
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}
