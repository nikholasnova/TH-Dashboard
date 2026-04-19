interface CustomDateRangeProps {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  isValid: boolean;
}

const inputClass =
  'h-14 bg-transparent border-0 border-b border-[var(--hairline)] pl-0 pr-1 text-sm tracking-tight text-[var(--fg)] focus:outline-none focus:border-[var(--fg)] transition-colors [color-scheme:dark]';

export function CustomDateRange({
  start,
  end,
  onStartChange,
  onEndChange,
  isValid,
}: CustomDateRangeProps) {
  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
      <div className="flex items-center gap-3">
        <label className="text-xs tracking-tight text-[var(--fg-muted)]">Start</label>
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => onStartChange(e.target.value)}
          className={inputClass}
        />
      </div>
      <div className="flex items-center gap-3">
        <label className="text-xs tracking-tight text-[var(--fg-muted)]">End</label>
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => onEndChange(e.target.value)}
          className={inputClass}
        />
      </div>
      {!isValid && start && end && (
        <span className="text-xs text-[var(--warning)] pb-4">Pick a valid range</span>
      )}
    </div>
  );
}
