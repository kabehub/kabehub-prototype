import { NextRequest, NextResponse } from "next/server";
import { fetchGithubFile } from "@/lib/github";

// POST /api/fetch-github
// body: { url: string }
// response: { content: string; truncated: boolean } | { error: string }
export async function POST(req: NextRequest) {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const url = typeof body === "object" && body !== null && "url" in body
    ? (body as { url?: unknown }).url
    : null;

  if (typeof url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  const result = await fetchGithubFile(url);
  if ("error" in result) {
    const status = result.error === "サポートされていないURLまたはブランチです" ||
      result.error === "サポートされていない拡張子です"
      ? 400
      : 502;

    return NextResponse.json(result, { status });
  }

  return NextResponse.json(result);
}
