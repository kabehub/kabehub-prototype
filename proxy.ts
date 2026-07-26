import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { buildCspHeaderValue } from "@/lib/csp";

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

function shouldRunSupabaseSessionCheck(pathname: string): boolean {
  if (
    pathname === "/" ||
    pathname.startsWith("/settings/") ||
    pathname === "/settings" ||
    pathname === "/login" ||
    pathname.startsWith("/admin/") ||
    pathname === "/admin"
  ) {
    return true;
  }

  if (pathname.startsWith("/api/")) {
    if (
      pathname.startsWith("/api/mcp") ||
      pathname.startsWith("/api/share") ||
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

  return false;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

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

  const shouldRunSessionCheck = shouldRunSupabaseSessionCheck(pathname);

  if (!shouldRunSessionCheck) {
    return applyCsp(res);
  }

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const finalizeWithCookies = (target: NextResponse) => {
    res.cookies.getAll().forEach((cookie) => {
      target.cookies.set(cookie);
    });
    return applyCsp(target);
  };

  const redirectWithCookies = (url: URL) => {
    return finalizeWithCookies(NextResponse.redirect(url));
  };

  const unauthorizedApiResponse = () => {
    const unauthorized = new NextResponse(null, {
      status: 401,
      headers: {
        "Cache-Control": "no-store",
      },
    });
    return finalizeWithCookies(unauthorized);
  };

  if (
    !user &&
    !isPublicOptionalAuthApi(pathname) &&
    !isLoginPage(pathname) &&
    pathname !== "/auth/callback"
  ) {
    if (pathname.startsWith("/api/")) {
      return unauthorizedApiResponse();
    }
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return redirectWithCookies(loginUrl);
  }

  if (user && isLoginPage(pathname)) {
    return redirectWithCookies(new URL("/", req.url));
  }

  return applyCsp(res);
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
    "/api/((?!mcp|share|reports(?:/|$)|auth/github/callback(?:/|$)|cron/storage-cleanup(?:/|$)|csp-report(?:/|$)).*)",
  ],
};
