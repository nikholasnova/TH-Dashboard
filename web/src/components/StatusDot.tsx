export type NodeStatus = 'live' | 'stale' | 'offline' | 'alert';

interface StatusDotProps {
  status: NodeStatus;
  size?: number;
  title?: string;
}

export function StatusDot({ status, size = 8, title }: StatusDotProps) {
  if (status === 'live') {
    return (
      <span
        className="live-indicator"
        style={{ width: size, height: size }}
        title={title ?? 'Live'}
        aria-label={title ?? 'Live'}
      />
    );
  }
  if (status === 'stale') {
    return (
      <span
        className="inline-block rounded-full"
        style={{
          width: size,
          height: size,
          border: '1.5px solid var(--warning)',
          background: 'transparent',
        }}
        title={title ?? 'Stale'}
        aria-label={title ?? 'Stale'}
      />
    );
  }
  if (status === 'offline') {
    return (
      <span
        className="inline-block rounded-full"
        style={{ width: size, height: size, background: 'var(--error)' }}
        title={title ?? 'Offline'}
        aria-label={title ?? 'Offline'}
      />
    );
  }
  return (
    <span
      className="inline-block rounded-full"
      style={{ width: size, height: size, background: 'var(--accent)' }}
      title={title ?? 'Alert'}
      aria-label={title ?? 'Alert'}
    />
  );
}
