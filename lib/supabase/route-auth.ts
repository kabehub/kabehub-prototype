import { NextRequest, NextResponse } from "next/server";
import {
  createClient,
  type User,
  type SupabaseClient,
} from "@supabase/supabase-js";
import {
  isBearerCapableApi,
  parseBearerAuthorization,
} from "@/lib/proxy-paths";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

type ResolvedRouteAuth =
  | {
      ok: true;
      user: User;
      supabase: SupabaseClient;
      authMode: "cookie" | "bearer";
      authResponse: NextResponse;
    }
  | {
      ok: false;
      authMode: "cookie";
      supabase: SupabaseClient;
      authResponse: NextResponse;
    }
  | {
      ok: false;
      authMode: "bearer" | "none";
      authResponse: NextResponse;
    };

function buildFinalizers(authResponse: NextResponse) {
  const finalizeResponse = <T extends NextResponse>(response: T): T => {
    const authCookies = authResponse.cookies.getAll();
    for (const cookie of authCookies) {
      response.cookies.set(cookie);
    }
    if (authCookies.length > 0) {
      response.headers.set("Cache-Control", "private, no-store");
    }
    return response;
  };

  const finalizeJson = (body: unknown, init?: ResponseInit): NextResponse =>
    finalizeResponse(NextResponse.json(body, init));

  return { finalizeResponse, finalizeJson };
}

async function resolveRouteAuth(
  req: NextRequest
): Promise<ResolvedRouteAuth> {
  const credential = parseBearerAuthorization(
    req.headers.get("authorization")
  );

  if (credential.present) {
    const authResponse = new NextResponse();

    if (!isBearerCapableApi(req.nextUrl.pathname, req.method)) {
      return { ok: false, authMode: "none", authResponse };
    }
    if (!credential.token) {
      return { ok: false, authMode: "bearer", authResponse };
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: { Authorization: `Bearer ${credential.token}` },
        },
        auth: {
          autoRefreshToken: false,
          persistSession: false,
          detectSessionInUrl: false,
        },
      }
    );
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(credential.token);

    if (error || !user) {
      return { ok: false, authMode: "bearer", authResponse };
    }

    return {
      ok: true,
      user,
      supabase,
      authMode: "bearer",
      authResponse,
    };
  }

  const authResponse = new NextResponse();
  const supabase = createRouteHandlerSupabaseClient(req, authResponse);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  return authError || !user
    ? { ok: false, authMode: "cookie", supabase, authResponse }
    : {
        ok: true,
        user,
        supabase,
        authMode: "cookie",
        authResponse,
      };
}

export async function requireRouteUser(req: NextRequest): Promise<
  | {
      ok: true;
      user: User;
      supabase: SupabaseClient;
      finalizeJson: (body: unknown, init?: ResponseInit) => NextResponse;
      finalizeResponse: <T extends NextResponse>(response: T) => T;
    }
  | { ok: false; response: NextResponse }
> {
  const auth = await resolveRouteAuth(req);
  const { finalizeResponse, finalizeJson } = buildFinalizers(
    auth.authResponse
  );

  if (!auth.ok) {
    return {
      ok: false,
      response: finalizeJson({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return {
    ok: true,
    user: auth.user,
    supabase: auth.supabase,
    finalizeJson,
    finalizeResponse,
  };
}

export async function getOptionalRouteUser(req: NextRequest): Promise<
  | {
      ok: true;
      user: User | null;
      supabase: SupabaseClient;
      finalizeJson: (body: unknown, init?: ResponseInit) => NextResponse;
      finalizeResponse: <T extends NextResponse>(response: T) => T;
    }
  | { ok: false; response: NextResponse }
> {
  const auth = await resolveRouteAuth(req);
  const { finalizeResponse, finalizeJson } = buildFinalizers(
    auth.authResponse
  );

  if (auth.ok) {
    return {
      ok: true,
      user: auth.user,
      supabase: auth.supabase,
      finalizeJson,
      finalizeResponse,
    };
  }

  if (auth.authMode === "cookie") {
    // optional-authのCookie認証エラーは未ログインとして正規化する。
    // resolveRouteAuth()が生成した同一クライアントをそのまま返す。
    return {
      ok: true,
      user: null,
      supabase: auth.supabase,
      finalizeJson,
      finalizeResponse,
    };
  }

  return {
    ok: false,
    response: finalizeJson({ error: "Unauthorized" }, { status: 401 }),
  };
}
