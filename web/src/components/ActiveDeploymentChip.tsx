interface ActiveDeploymentChipProps {
  name: string;
  location?: string;
  onClear: () => void;
  className?: string;
}

export function ActiveDeploymentChip({ name, location, onClear, className = '' }: ActiveDeploymentChipProps) {
  return (
    <div
      className={`px-4 py-2 rounded-lg bg-[var(--active-bg)] border border-[var(--divider)] inline-flex items-center gap-2 ${className}`}
    >
      <span className="text-sm text-[var(--foreground)]">
        Showing: {name}
        {location ? ` (${location})` : ''}
      </span>
      <button
        onClick={onClear}
        className="text-[var(--foreground-muted)] hover:text-[var(--foreground)]"
        aria-label="Clear deployment filter"
      >
        ✕
      </button>
    </div>
  );
}
