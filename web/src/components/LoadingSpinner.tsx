const DOT_SIZES = {
  sm: 'w-1.5 h-1.5',
  md: 'w-2 h-2',
  lg: 'w-3 h-3',
} as const;

interface LoadingSpinnerProps {
  message?: string;
  className?: string;
  color?: string;
  size?: keyof typeof DOT_SIZES;
}

export function LoadingSpinner({
  message = 'Loading...',
  className,
  color = 'var(--foreground-secondary)',
  size = 'md',
}: LoadingSpinnerProps) {
  return (
    <div className={`flex flex-col items-center justify-center ${className ?? ''}`}>
      <div className="flex gap-1.5 mb-3">
        {[0, 160, 320].map((delay) => (
          <span
            key={delay}
            className={`${DOT_SIZES[size]} rounded-full`}
            style={{
              backgroundColor: color,
              animation: `dotPulse 1.4s ease-in-out ${delay}ms infinite`,
            }}
          />
        ))}
      </div>
      {message && <p className="text-sm text-[var(--foreground-muted)]">{message}</p>}
    </div>
  );
}

export function BounceDots({
  color = 'var(--foreground-secondary)',
  size = 'md',
}: {
  color?: string;
  size?: keyof typeof DOT_SIZES;
}) {
  return (
    <div className="flex gap-1.5">
      {[0, 160, 320].map((delay) => (
        <span
          key={delay}
          className={`${DOT_SIZES[size]} rounded-full`}
          style={{
            backgroundColor: color,
            animation: `dotPulse 1.4s ease-in-out ${delay}ms infinite`,
          }}
        />
      ))}
    </div>
  );
}
