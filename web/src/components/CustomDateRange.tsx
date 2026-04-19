interface CustomDateRangeProps {
  start: string;
  end: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  isValid: boolean;
}

export function CustomDateRange({
  start,
  end,
  onStartChange,
  onEndChange,
  isValid,
}: CustomDateRangeProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--fg-muted)]">Start</label>
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => onStartChange(e.target.value)}
          className="h-14 bg-transparent border border-[var(--hairline-strong)] rounded-md px-4 text-sm text-[var(--fg)]"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--fg-muted)]">End</label>
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => onEndChange(e.target.value)}
          className="h-14 bg-transparent border border-[var(--hairline-strong)] rounded-md px-4 text-sm text-[var(--fg)]"
        />
      </div>
      {!isValid && start && end && (
        <span className="text-xs text-[var(--warning)]">Pick a valid range</span>
      )}
    </div>
  );
}

