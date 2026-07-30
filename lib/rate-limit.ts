// lib/rate-limit.ts
// Per-user rate limiting using Upstash Redis.
// Falls back gracefully if Upstash env vars are not set (dev / self-host).

import { NextResponse } from "next/server";
import { Ratelimit } from "@upstash/ratelimit";
import type { Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimits = new Map<string, Ratelimit>();

type RateLimitPolicy = Readonly<{
  prefix: string;
  limit: number;
  window: Duration;
}>;

const CHAT_RATE_LIMIT_POLICY: RateLimitPolicy = {
  prefix: "kabehub:chat",
  limit: 20,
  window: "1 m",
};

// MCP limit starts at 60 requests/minute and is expected to be tuned in operations.
const MCP_RATE_LIMIT_POLICY: RateLimitPolicy = {
  prefix: "kabehub:mcp",
  limit: 60,
  window: "1 m",
};

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

async function checkRateLimit(userId: string, policy: RateLimitPolicy): Promise<RateLimitResult> {
  const rl = createRateLimiter(policy.prefix, policy.limit, policy.window);
  if (!rl) return { allowed: true, limit: 0, remaining: 0, resetAt: 0 };
  const { success, limit, remaining, reset } = await rl.limit(userId);
  return { allowed: success, limit, remaining, resetAt: reset };
}

export async function checkChatRateLimit(userId: string): Promise<RateLimitResult> {
  return checkRateLimit(userId, CHAT_RATE_LIMIT_POLICY);
}

export async function checkMcpRateLimit(userId: string): Promise<RateLimitResult> {
  return checkRateLimit(userId, MCP_RATE_LIMIT_POLICY);
}

export async function checkMcpLimitResponse(userId: string): Promise<NextResponse | null> {
  const rl = await checkMcpRateLimit(userId);
  if (rl.allowed) return null;

  const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
  return NextResponse.json(
    {
      error: 'リクエストが多すぎます。少し待ってから再度お試しください。',
      retryAfter,
    },
    {
      status: 429,
      headers: {
        'X-RateLimit-Limit': String(rl.limit),
        'X-RateLimit-Remaining': String(rl.remaining),
        'Retry-After': String(retryAfter),
      },
    }
  );
}
