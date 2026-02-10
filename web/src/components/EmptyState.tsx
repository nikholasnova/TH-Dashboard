interface EmptyStateProps {
  title: string;
  subtitle?: string;
}

export function EmptyState({ title, subtitle }: EmptyStateProps) {
  return (
    <div className="glass-card p-12 text-center">
      <p className="text-xl text-[#a0aec0] mb-2">{title}</p>
      {subtitle && <p className="text-sm text-[#a0aec0]/60">{subtitle}</p>}
    </div>
  );
}

