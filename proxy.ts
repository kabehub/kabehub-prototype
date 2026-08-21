import { createServerClient } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { API_KEY_HEADER_NAMES } from "@kabehub/shared";
import { buildCspHeaderValue } from "@/lib/csp";
import {
  isBearerCapableApi,
  isCorsEligibleApi,
  isMcpBearerApi,
  isProtectedRedirectPath,
  isPublicShareReadApi,
  parseBearerAuthorization,
} from "@/lib/proxy-paths";

const ALLOWED_CORS_ORIGINS = new Set([
  "capacitor://localhost",
  "https://localhost",
]);

const CORS_ALLOW_HEADERS = [
  "Authorization",
  "Content-Type",
  ...Object.values(API_KEY_HEADER_NAMES),
].join(", ");

export function appendVaryOrigin(headers: Headers): void {
  const current = headers.get("Vary");
  if (!current) {
    headers.set("Vary", "Origin");
    return;
  }

  const values = current
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    values.some(
      (value) => value === "*" || value.toLowerCase() === "origin"
    )
  ) {
    return;
  }
  headers.set("Vary", [...values, "Origin"].join(", "));
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseHttpOrigin = "";
let supabaseWsOrigin = "";

if (supabaseUrl) {
  try {
    const origin = new URL(supabaseUrl).origin;
    supabaseHttpOrigin = origin;
    supabaseWsOrigin = origin.replace(/^http/, "ws");
  } catch {
    supabaseHttpOrigin = "";
    supabaseWsOrigin = "";
  }
}

function isCspEligiblePath(pathname: string): boolean {
  return !(
    pathname === "/favicon.ico" ||
    pathname === "/sitemap.xml" ||
    pathname === "/robots.txt" ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/static/") ||
    pathname.startsWith("/_next/image")
  );
}

function isPublicOptionalAuthApi(pathname: string): boolean {
  return pathname === "/api/explore" || pathname.startsWith("/api/explore/");
}

function isLoginPage(pathname: string): boolean {
  return pathname === "/login";
}

function shouldRunSupabaseSessionCheck(
  pathname: string,
  method: string
): boolean {
  if (
    isProtectedRedirectPath(pathname) ||
    isLoginPage(pathname)
  ) {
    return true;
  }

  if (pathname.startsWith("/api/")) {
    if (
      isMcpBearerApi(pathname) ||
      isPublicShareReadApi(pathname, method) ||
      pathname === "/api/reports" ||
      pathname.startsWith("/api/reports/") ||
      pathname === "/api/auth/github/callback" ||
      pathname.startsWith("/api/auth/github/callback/") ||
      pathname === "/api/cron/storage-cleanup" ||
      pathname.startsWith("/api/cron/storage-cleanup/") ||
      pathname === "/api/csp-report" ||
      pathname.startsWith("/api/csp-report/")
    ) {
      return false;
    }
    return true;
  }

  // Remaining matched page routes, including /auth/callback and public
  // share views, skip the Supabase session check. Their Route or page
  // implementation owns any authentication behavior.
  return false;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requestOrigin = req.headers.get("origin");
  const corsMethod =
    req.method === "OPTIONS"
      ? (req.headers.get("access-control-request-method") ?? "").toUpperCase()
      : req.method;
  const corsEligible = isCorsEligibleApi(pathname, corsMethod);
  const corsOriginAllowed =
    requestOrigin !== null && ALLOWED_CORS_ORIGINS.has(requestOrigin);

  const isPrefetch =
    req.headers.get("next-router-prefetch") !== null ||
    req.headers.get("purpose") === "prefetch";
  const shouldApplyCsp = isCspEligiblePath(pathname) && !isPrefetch;

  const requestHeaders = new Headers(req.headers);
  requestHeaders.delete("content-security-policy");
  requestHeaders.delete("content-security-policy-report-only");

  let nonce = "";
  let cspHeaderName = "";
  let cspValue = "";
  if (shouldApplyCsp) {
    nonce = Buffer.from(crypto.randomUUID()).toString("base64");
    const isReportOnly = process.env.CSP_REPORT_ONLY !== "false";
    cspHeaderName = isReportOnly
      ? "Content-Security-Policy-Report-Only"
      : "Content-Security-Policy";
    cspValue = buildCspHeaderValue({
      nonce,
      isDev: process.env.NODE_ENV !== "production",
      supabaseHttpOrigin,
      supabaseWsOrigin,
      reportEndpointConfigured: Boolean(
        process.env.CSP_REPORT_ENDPOINT?.trim()
      ),
    });
    requestHeaders.set("x-nonce", nonce);
    requestHeaders.set(cspHeaderName, cspValue);
  }

  const res = shouldApplyCsp
    ? NextResponse.next({ request: { headers: requestHeaders } })
    : NextResponse.next();

  const applyCsp = (target: NextResponse) => {
    if (!shouldApplyCsp) return target;
    target.headers.set(cspHeaderName, cspValue);
    const endpoint = process.env.CSP_REPORT_ENDPOINT?.trim();
    if (endpoint) {
      target.headers.set(
        "Reporting-Endpoints",
        `csp-endpoint="${endpoint}"`
      );
    }
    return target;
  };

  const applyCors = (target: NextResponse) => {
    if (!corsEligible || !requestOrigin) return target;
    appendVaryOrigin(target.headers);
    if (corsOriginAllowed) {
      target.headers.set("Access-Control-Allow-Origin", requestOrigin);
    }
    return target;
  };

  const finalizeResponse = (target: NextResponse) =>
    applyCors(applyCsp(target));

  if (req.method === "OPTIONS" && corsEligible && corsOriginAllowed) {
    const preflight = new NextResponse(null, { status: 204 });
    preflight.headers.set("Access-Control-Allow-Methods", corsMethod);
    preflight.headers.set("Access-Control-Allow-Headers", CORS_ALLOW_HEADERS);
    return finalizeResponse(preflight);
  }

  const shouldRunSessionCheck = shouldRunSupabaseSessionCheck(
    pathname,
    req.method
  );

  if (!shouldRunSessionCheck) {
    return finalizeResponse(res);
  }

  const bearerCredential = parseBearerAuthorization(
    req.headers.get("authorization")
  );
  const bearerToken = bearerCredential.present
    ? bearerCredential.token
    : null;
  const authMode: "bearer" | "cookie" | "none" =
    pathname.startsWith("/api/") && bearerCredential.present
      ? bearerToken && isBearerCapableApi(pathname, req.method)
        ? "bearer"
        : "none"
      : "cookie";

  let user: User | null = null;
  let authFailed = false;

  if (authMode === "cookie") {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              res.cookies.set(name, value, options);
            });
          },
        },
      }
    );
    const result = await supabase.auth.getUser();
    user = result.data.user;
    authFailed = Boolean(result.error || !user);
  } else if (authMode === "bearer") {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${bearerToken}`,
          },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    );
    const result = await supabase.auth.getUser(bearerToken!);
    user = result.data.user;
    authFailed = Boolean(result.error || !user);
  } else {
    authFailed = true;
  }

  const finalizeWithCookies = (target: NextResponse) => {
    res.cookies.getAll().forEach((cookie) => {
      target.cookies.set(cookie);
    });
    return finalizeResponse(target);
  };

  const redirectWithCookies = (url: URL) => {
    return finalizeWithCookies(NextResponse.redirect(url));
  };

  const unauthorizedApiResponse = () => {
    const unauthorized = NextResponse.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
    return finalizeWithCookies(unauthorized);
  };

  if (
    authFailed &&
    !(authMode === "cookie" && isPublicOptionalAuthApi(pathname)) &&
    !isLoginPage(pathname)
  ) {
    if (pathname.startsWith("/api/")) {
      return unauthorizedApiResponse();
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return redirectWithCookies(loginUrl);
  }

  if (!authFailed && user && isLoginPage(pathname)) {
    return redirectWithCookies(new URL("/", req.url));
  }

  return finalizeResponse(res);
}

export const config = {
  matcher: [
    {
      source:
        "/((?!api(?:/|$)|_next/static(?:/|$)|_next/image(?:/|$)|favicon\\.ico$|sitemap\\.xml$|robots\\.txt$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    "/",
    "/settings/:path*",
    "/login",
    "/admin/:path*",
    "/stats",
    "/memory",
    "/album",
    "/arena",
    "/calendar",
    "/image",
    "/novel-check",
    "/threads/:id/tree",
    "/api/((?!mcp(?:/|$)|auth/github/callback(?:/|$)|cron/storage-cleanup(?:/|$)|csp-report(?:/|$)).*)",
  ],
};
