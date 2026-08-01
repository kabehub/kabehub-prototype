import { NextRequest } from "next/server";
import { fetchGithubFile } from "@/lib/github";
import { requireRouteUser } from "@/lib/supabase/route-auth";

// POST /api/fetch-github
// body: { url: string }
// response: { content: string; truncated: boolean } | { error: string }
export async function POST(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { finalizeJson } = auth;

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
