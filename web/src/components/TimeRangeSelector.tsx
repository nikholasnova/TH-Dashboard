import { TIME_RANGES } from '@/lib/constants';

interface TimeRangeSelectorProps {
  selectedRange: number;
  onRangeChange: (hours: number) => void;
}

export function TimeRangeSelector({ selectedRange, onRangeChange }: TimeRangeSelectorProps) {
  return (
    <div className="glass-card p-2 flex gap-1">
      {TIME_RANGES.map((range) => (
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

