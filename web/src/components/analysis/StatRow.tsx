interface StatRowProps {
  label: string;
  value: string;
  valueClassName?: string;
}

export function StatRow({ label, value, valueClassName }: StatRowProps) {
  return (
    <tr className="border-b border-[var(--divider)] last:border-b-0">
      <td className="py-1.5 pr-4 text-sm text-[var(--foreground-muted)]">{label}</td>
      <td
        className={`py-1.5 text-sm text-right font-mono ${valueClassName ?? 'text-[var(--foreground)]'}`}
      >
        {value}
      </td>
    </tr>
  );
}
