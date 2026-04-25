import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

function hasUpstashEnv(): boolean {
  return Boolean(
    (process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL) &&
    (process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)
  );
}

function redisFromEnv(): Redis | null {
  if (!hasUpstashEnv()) return null;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL!;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN!;
  return new Redis({ url, token });
}

type LimiterConfig = { limit: number; window: `${number} ${'s' | 'm' | 'h' | 'd'}`; prefix: string };

function buildLimiter(cfg: LimiterConfig): Ratelimit | null {
  const redis = redisFromEnv();
  if (!redis) return null;
  return new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(cfg.limit, cfg.window),
    prefix: cfg.prefix,
    analytics: false,
  });
}

const authChatRL = buildLimiter({ limit: 30, window: '15 m', prefix: 'rl:chat-a' });
const nlFilterRL = buildLimiter({ limit: 20, window: '15 m', prefix: 'rl:nlf' });
const reportRL = buildLimiter({ limit: 5, window: '1 h', prefix: 'rl:report' });

type LimitResult = { success: boolean; degraded?: boolean };

async function safeLimit(limiter: Ratelimit | null, key: string): Promise<LimitResult> {
  if (!limiter) {
    const allowWhenUnconfigured = process.env.NODE_ENV !== 'production';
    if (!allowWhenUnconfigured) {
      console.error('Upstash rate limiter not configured — failing closed in production');
    }
    return { success: allowWhenUnconfigured, degraded: true };
  }
  try {
    const { success } = await limiter.limit(key);
    return { success };
  } catch (err) {
    console.error('rate limiter rpc failed:', err);
    // Fail closed in prod, open in dev so devs aren't blocked by outages
    return { success: process.env.NODE_ENV !== 'production', degraded: true };
  }
}

export const authChatLimiter = { limit: (key: string) => safeLimit(authChatRL, key) };
export const nlFilterLimiter = { limit: (key: string) => safeLimit(nlFilterRL, key) };
export const reportLimiter = { limit: (key: string) => safeLimit(reportRL, key) };
