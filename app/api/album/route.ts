import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export async function GET(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") ?? "0", 10);
  const PAGE_SIZE = 20;

  const { data: messages, error, count } = await supabase
    .from("messages")
    .select("id, thread_id, created_at, content, metadata", { count: "exact" })
    .eq("user_id", user.id)
    .eq("provider", "image_gen")
    .neq("metadata->>image_deleted", "true")
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (error) return NextResponse.json({ error }, { status: 500 });

  const storagePaths = (messages ?? [])
    .map((m: Record<string, unknown>) => (m.metadata as Record<string, unknown> | null)?.storagePath as string | null)
    .filter((p): p is string => !!p);

  const signedUrls: Record<string, string> = {};
  if (storagePaths.length > 0) {
    const { data: urlData } = await supabase.storage
      .from("generated-images")
      .createSignedUrls(storagePaths, 3600);
    if (urlData) {
      for (const item of urlData) {
        if (item.signedUrl && item.path) signedUrls[item.path] = item.signedUrl;
      }
    }
  }

  const items = (messages ?? []).map((m: Record<string, unknown>) => {
    const meta = m.metadata as Record<string, unknown> | null;
    const storagePath = meta?.storagePath as string | null;
    return {
      ...m,
      signedUrl: storagePath ? signedUrls[storagePath] ?? null : null,
    };
  });

  const total = count ?? 0;
  return NextResponse.json({
    items,
    total,
    hasMore: (page + 1) * PAGE_SIZE < total,
  });
}
