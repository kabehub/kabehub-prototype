import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);

  // 認証チェック
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const cursor = searchParams.get("cursor") ?? null;
  const limit = 20;

  // ベースクエリ（profilesのJOINなし）
  let dbQuery = supabase
    .from("threads")
    .select(
      `
      id,
      title,
      share_token,
      created_at,
      updated_at,
      allow_prompt_fork,
      user_id,
      thread_tags (
        name
      ),
      messages (count)
    `
    )
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (query) {
    dbQuery = dbQuery.ilike("title", `%${query}%`);
  }

  if (cursor) {
    dbQuery = dbQuery.lt("created_at", cursor);
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error("explore API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  // fork_count を別クエリで取得
  const threadIds = items.map((t) => t.id);
  let forkCounts: Record<string, number> = {};

  if (threadIds.length > 0) {
    const { data: forkData } = await supabase
      .from("threads")
      .select("forked_from_id")
      .in("forked_from_id", threadIds);

    if (forkData) {
      for (const row of forkData) {
        if (row.forked_from_id) {
          forkCounts[row.forked_from_id] = (forkCounts[row.forked_from_id] ?? 0) + 1;
        }
      }
    }
  }

  // profiles を別クエリで取得
  const userIds = items.map((t) => (t as any).user_id).filter(Boolean);
  let profileMap: Record<string, { handle: string | null; display_name: string | null }> = {};

  if (userIds.length > 0) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, handle, display_name")
      .in("id", userIds);

    if (profileData) {
      for (const p of profileData) {
        profileMap[p.id] = { handle: p.handle, display_name: p.display_name };
      }
    }
  }

  // レスポンス整形
  const result = items.map((t) => ({
    id: t.id,
    title: t.title,
    share_token: t.share_token,
    created_at: t.created_at,
    updated_at: t.updated_at,
    allow_prompt_fork: t.allow_prompt_fork,
    handle: profileMap[(t as any).user_id]?.handle ?? null,
    display_name: profileMap[(t as any).user_id]?.display_name ?? null,
    tags: (t.thread_tags as any[])?.map((tag) => tag.name) ?? [],
    message_count: (t.messages as any)?.[0]?.count ?? 0,
    fork_count: forkCounts[t.id] ?? 0,
  }));

  const nextCursor = hasMore ? items[items.length - 1].created_at : null;

  return NextResponse.json({ items: result, nextCursor, hasMore });
}
