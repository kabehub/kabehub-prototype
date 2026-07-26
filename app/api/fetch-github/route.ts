import { NextRequest, NextResponse } from "next/server";
import { fetchGithubFile } from "@/lib/github";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

// POST /api/fetch-github
// body: { url: string }
// response: { content: string; truncated: boolean } | { error: string }
export async function POST(req: NextRequest) {
  const authResponse = new NextResponse();
  const supabase = createRouteHandlerSupabaseClient(req, authResponse);

  const finalizeJson = (body: unknown, init?: ResponseInit): NextResponse => {
    const response = NextResponse.json(body, init);
    const authCookies = authResponse.cookies.getAll();

    for (const cookie of authCookies) {
      response.cookies.set(cookie);
    }

    if (authCookies.length > 0) {
      response.headers.set("Cache-Control", "private, no-store");
    }

    return response;
  };

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return finalizeJson({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return finalizeJson({ error: "Invalid request body" }, { status: 400 });
  }

  const url = typeof body === "object" && body !== null && "url" in body
    ? (body as { url?: unknown }).url
    : null;

  if (typeof url !== "string") {
    return finalizeJson({ error: "url is required" }, { status: 400 });
  }

  const result = await fetchGithubFile(url);
  if ("error" in result) {
    const status = result.error === "サポートされていないURLまたはブランチです" ||
      result.error === "サポートされていない拡張子です"
      ? 400
      : 502;

    return finalizeJson(result, { status });
  }

  return finalizeJson(result);
}
