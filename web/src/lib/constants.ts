export const TIME_RANGES = [
  { label: '1h', hours: 1 },
  { label: '6h', hours: 6 },
  { label: '24h', hours: 24 },
  { label: '7d', hours: 168 },
  { label: 'Custom', hours: -1 },
] as const;

export const DEPLOYMENT_ALL_TIME_HOURS = -2;
export const DEPLOYMENT_ALL_TIME_LABEL = 'All Time';

export const DEVICES = [
  { id: 'node1', name: 'Node 1', color: '#0075ff' },
  { id: 'node2', name: 'Node 2', color: '#01b574' },
] as const;

export const REFRESH_INTERVAL = 30000;
export const STALE_THRESHOLD_MS = 5 * 60 * 1000;
