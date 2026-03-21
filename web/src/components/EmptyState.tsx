interface EmptyStateProps {
  title: string;
  subtitle?: string;
}

export function EmptyState({ title, subtitle }: EmptyStateProps) {
  return (
    <div className="glass-card p-12 text-center">
      <div className="flex justify-center mb-5">
        <svg
          width="48"
          height="48"
          viewBox="0 0 48 48"
          fill="none"
          className="text-[var(--foreground-muted)]"
        >
          <circle
            cx="24"
            cy="24"
            r="20"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            opacity="0.5"
          />
          <text
            x="24"
            y="29"
            textAnchor="middle"
            fill="currentColor"
            fontSize="18"
            fontFamily="var(--font-jetbrains), monospace"
            fontWeight="300"
            opacity="0.6"
          >
            ?
          </text>
        </svg>
      </div>
      <p className="text-2xl font-light text-[var(--foreground-secondary)] mb-2">{title}</p>
      {subtitle && <p className="text-sm text-[var(--foreground-muted)]">{subtitle}</p>}
    </div>
  );
}
