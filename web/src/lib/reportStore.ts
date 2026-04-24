import { Redis } from '@upstash/redis';
import type { ReportBundle } from './supabase/types';

const TTL_SECONDS = 30 * 60;

function hasUpstashEnv(): boolean {
  return Boolean(
    (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
      (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN),
  );
}

function redisFromEnv(): Redis | null {
  if (!hasUpstashEnv()) return null;
  const url =
    process.env.KV_REST_API_URL || (process.env.UPSTASH_REDIS_REST_URL as string);
  const token =
    process.env.KV_REST_API_TOKEN || (process.env.UPSTASH_REDIS_REST_TOKEN as string);
  return new Redis({ url, token });
}

// Dev fallback: in-memory store used only when Upstash is unconfigured.
// Not durable across restarts or scale-out; safe for local dev.
type DevEntry = { value: string; expiresAt: number };
const devStore = new Map<string, DevEntry>();

function devGet(key: string): string | null {
  const entry = devStore.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    devStore.delete(key);
    return null;
  }
  return entry.value;
}

function devSet(key: string, value: string, ttlSeconds: number): void {
  devStore.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function storeString(key: string, value: string): Promise<boolean> {
  const redis = redisFromEnv();
  if (!redis) {
    if (process.env.NODE_ENV === 'production') {
      console.error('Report store unavailable: Upstash not configured in prod');
      return false;
    }
    devSet(key, value, TTL_SECONDS);
    return true;
  }
  try {
    await redis.set(key, value, { ex: TTL_SECONDS });
    return true;
  } catch (err) {
    console.error('Report store write failed:', err);
    return false;
  }
}

async function fetchString(key: string): Promise<string | null> {
  const redis = redisFromEnv();
  if (!redis) {
    if (process.env.NODE_ENV === 'production') return null;
    return devGet(key);
  }
  try {
    const raw = await redis.get<string | object>(key);
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'string') return raw;
    // Upstash sometimes auto-parses JSON — re-stringify so callers get raw string back
    return JSON.stringify(raw);
  } catch (err) {
    console.error('Report store read failed:', err);
    return null;
  }
}

export interface ReportMeta {
  filename: string;
  byte_size: number;
  user_id: string;
  start: string;
  end: string;
}

export async function storeBundle(contextId: string, bundle: ReportBundle): Promise<boolean> {
  return storeString(`report:bundle:${contextId}`, JSON.stringify(bundle));
}

export async function getBundle(contextId: string): Promise<ReportBundle | null> {
  const raw = await fetchString(`report:bundle:${contextId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReportBundle;
  } catch {
    return null;
  }
}

export async function storeTex(
  reportId: string,
  tex: string,
  meta: ReportMeta,
): Promise<boolean> {
  const [okTex, okMeta] = await Promise.all([
    storeString(`report:tex:${reportId}`, tex),
    storeString(`report:meta:${reportId}`, JSON.stringify(meta)),
  ]);
  return okTex && okMeta;
}

export async function getTex(reportId: string): Promise<string | null> {
  return fetchString(`report:tex:${reportId}`);
}

export async function getMeta(reportId: string): Promise<ReportMeta | null> {
  const raw = await fetchString(`report:meta:${reportId}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ReportMeta;
  } catch {
    return null;
  }
}
