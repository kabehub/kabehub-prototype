// lib/rate-limit.ts
// Per-user rate limiting using Upstash Redis.
// Falls back gracefully if Upstash env vars are not set (dev / self-host).

import { Ratelimit } from "@upstash/ratelimit";
import type { Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimits = new Map<string, Ratelimit>();

export function createRateLimiter(prefix: string, limit: number, window: Duration): Ratelimit | null {
  const cached = ratelimits.get(prefix);
  if (cached) return cached;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(limit, window),
    analytics: false,
    prefix,
  });
  ratelimits.set(prefix, ratelimit);
  return ratelimit;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export async function checkChatRateLimit(userId: string): Promise<RateLimitResult> {
  const rl = createRateLimiter("kabehub:chat", 20, "1 m");
  if (!rl) return { allowed: true, limit: 0, remaining: 0, resetAt: 0 };
  const { success, limit, remaining, reset } = await rl.limit(userId);
  return { allowed: success, limit, remaining, resetAt: reset };
}

export async function checkMcpRateLimit(userId: string): Promise<RateLimitResult> {
  // MCP limit starts at 60 requests/minute and is expected to be tuned in operations.
  const rl = createRateLimiter("kabehub:mcp", 60, "1 m");
  if (!rl) return { allowed: true, limit: 0, remaining: 0, resetAt: 0 };
  const { success, limit, remaining, reset } = await rl.limit(userId);
  return { allowed: success, limit, remaining, resetAt: reset };
}
