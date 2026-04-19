interface EmptyStateProps {
  title: string;
  subtitle?: string;
}

export function EmptyState({ title, subtitle }: EmptyStateProps) {
  return (
    <div className="py-16 border border-dashed border-[var(--hairline-strong)] rounded-md text-center">
      <p className="text-base text-[var(--fg-dim)] mb-1">{title}</p>
      {subtitle && <p className="text-xs text-[var(--fg-muted)]">{subtitle}</p>}
    </div>
  );
}
