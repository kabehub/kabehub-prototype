// lib/rate-limit.ts
// Per-user rate limiting for the /api/chat endpoint using Upstash Redis.
// Sliding window: 20 requests per user per minute.
// Falls back gracefully if Upstash env vars are not set (dev / self-host).

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let _ratelimit: Ratelimit | null = null;

function getRatelimit(): Ratelimit | null {
  if (_ratelimit) return _ratelimit;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _ratelimit = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(20, "1 m"),
    analytics: false,
    prefix: "kabehub:chat",
  });
  return _ratelimit;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
}

export async function checkChatRateLimit(userId: string): Promise<RateLimitResult> {
  const rl = getRatelimit();
  if (!rl) return { allowed: true, limit: 0, remaining: 0, resetAt: 0 };
  const { success, limit, remaining, reset } = await rl.limit(userId);
  // ★確認用ログ（確認後削除）
  console.log("[rate-limit] reset raw value:", reset, "Date.now():", Date.now());
  return { allowed: success, limit, remaining, resetAt: reset };
}
