import type { Device } from '@/lib/supabase';

export const COLOR_PALETTE = [
  '#9FB0C7',
  '#C9A984',
  '#C28879',
  '#9EBE9E',
  '#AE9BC8',
  '#8FB7C2',
  '#C9AE7A',
  '#C89898',
];

const LEGACY_PRESETS = new Set([
  '#a0aec0',
  '#111111',
  '#374151',
  '#6b7280',
  '#9ca3af',
  '#d1d5db',
  '#4b5563',
  '#1f2937',
  '#a3a3a3',
  '#16a34a',
  '#22d3ee',
  '#f59e0b',
  '#f43f5e',
  '#34d399',
  '#a78bfa',
  '#38bdf8',
  '#fb923c',
  '#e879f9',
  '#7a8aa0',
  '#b08968',
  '#9e6b5e',
  '#7d9f7d',
  '#8c7aa8',
  '#6e9ba6',
  '#a78f5b',
  '#a87b7b',
  '#4a5d7a',
  '#8b6b47',
  '#7a4a3e',
  '#4f7a4f',
  '#5d4a7a',
  '#3e6b78',
  '#8b6f2e',
  '#7a4a4a',
]);

type ColorSource = Pick<Device, 'color' | 'sort_order'>;

export function resolveDeviceColor(device: ColorSource): string {
  const color = (device.color ?? '').toLowerCase();
  if (!color || LEGACY_PRESETS.has(color)) {
    const order = device.sort_order ?? 1;
    const idx = Math.max(0, order - 1) % COLOR_PALETTE.length;
    return COLOR_PALETTE[idx];
  }
  return device.color;
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  h = ((h % 360) + 360) % 360;
  const sN = Math.max(0, Math.min(100, s)) / 100;
  const lN = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = lN - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const to = (v: number) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function humidityVariant(hex: string): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, s * 0.5, l + 4);
}
