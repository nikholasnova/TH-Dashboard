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
    <div className="glass-card p-3 flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--foreground-muted)]">Start</label>
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => onStartChange(e.target.value)}
          className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)]"
        />
      </div>
      <div className="flex items-center gap-2">
        <label className="text-xs text-[var(--foreground-muted)]">End</label>
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => onEndChange(e.target.value)}
          className="bg-[var(--input-bg)] border border-[var(--input-border)] rounded-lg px-3 py-2 text-sm text-[var(--foreground)]"
        />
      </div>
      {!isValid && start && end && (
        <span className="text-xs text-[var(--warning)]">Pick a valid range</span>
      )}
    </div>
  );
}

