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
    <div className="glass-card p-2 flex gap-1 overflow-x-auto scrollbar-thin">
      {ranges.map((range) => (
        <button
          key={range.hours}
          onClick={() => onRangeChange(range.hours)}
          data-label={range.label}
          className={`nav-pill px-3 py-2 sm:px-5 sm:py-2.5 text-xs sm:text-sm rounded-xl transition-all whitespace-nowrap shrink-0 ${
            selectedRange === range.hours
              ? 'nav-active text-[var(--foreground)] font-semibold'
              : 'text-[var(--foreground-muted)] hover:text-[var(--foreground)] hover:bg-[var(--hover-bg)]'
          }`}
        >
          {range.label}
        </button>
      ))}
    </div>
  );
}
