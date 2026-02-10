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
  color = '#a0aec0',
  size = 'md',
}: LoadingSpinnerProps) {
  return (
    <div className={`flex flex-col items-center justify-center ${className ?? ''}`}>
      <div className="flex gap-1 mb-3">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className={`${DOT_SIZES[size]} rounded-full animate-bounce`}
            style={{ animationDelay: `${delay}ms`, backgroundColor: color }}
          />
        ))}
      </div>
      {message && <p className="text-sm text-[#a0aec0]">{message}</p>}
    </div>
  );
}

export function BounceDots({
  color = '#a0aec0',
  size = 'md',
}: {
  color?: string;
  size?: keyof typeof DOT_SIZES;
}) {
  return (
    <div className="flex gap-1">
      {[0, 150, 300].map((delay) => (
        <span
          key={delay}
          className={`${DOT_SIZES[size]} rounded-full animate-bounce`}
          style={{ animationDelay: `${delay}ms`, backgroundColor: color }}
        />
      ))}
    </div>
  );
}
