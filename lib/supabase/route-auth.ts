import { NextRequest, NextResponse } from "next/server";
import type { User, SupabaseClient } from "@supabase/supabase-js";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

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
  const authResponse = new NextResponse();
  const supabase = createRouteHandlerSupabaseClient(req, authResponse);
  const { finalizeResponse, finalizeJson } = buildFinalizers(authResponse);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      response: finalizeJson({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return { ok: true, user, supabase, finalizeJson, finalizeResponse };
}

export async function getOptionalRouteUser(req: NextRequest): Promise<{
  user: User | null;
  supabase: SupabaseClient;
  finalizeJson: (body: unknown, init?: ResponseInit) => NextResponse;
  finalizeResponse: <T extends NextResponse>(response: T) => T;
}> {
  const authResponse = new NextResponse();
  const supabase = createRouteHandlerSupabaseClient(req, authResponse);
  const { finalizeResponse, finalizeJson } = buildFinalizers(authResponse);

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // optional-authでは認証エラーも「未ログイン」として正規化する。
  // requireRouteUser()の `authError || !user` と同じ認証結果の解釈を共有する。
  return { user: authError ? null : user, supabase, finalizeJson, finalizeResponse };
}
