import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export const dynamic = "force-dynamic";

type PublicThreadRow = {
  id: string;
  title: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string | null;
  user_id: string | null;
  genre: string | null;
  tags: string[] | null;
};

export async function GET(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const tag = searchParams.get("tag")?.trim() ?? "";
  const genre = searchParams.get("genre")?.trim() ?? "";
  const parentGenre = searchParams.get("parent_genre")?.trim() ?? "";
  const sort = searchParams.get("sort") ?? "newest";
  const cursor = searchParams.get("cursor") ?? null;
  const limit = 20;

  let dbQuery = supabase
    .from("public_threads_view")
    .select("id, title, is_public, created_at, updated_at, user_id, genre, tags")
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (query) {
    dbQuery = dbQuery.ilike("title", `%${query}%`);
  }

  if (tag) {
    dbQuery = dbQuery.contains("tags", [tag]);
  }

  if (genre) {
    dbQuery = dbQuery.eq("genre", genre);
  } else if (parentGenre) {
    if (parentGenre === "other") {
      dbQuery = dbQuery.is("genre", null);
    } else {
      const { getChildIds } = await import("@/lib/genres");
      const childIds = getChildIds(parentGenre as any);
      if (childIds.length > 0) {
        dbQuery = dbQuery.in("genre", childIds);
      }
    }
  }

  if (cursor) {
    dbQuery = dbQuery.lt("created_at", cursor);
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error("explore API error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as PublicThreadRow[];
  const hasMore = rows.length > limit;
  let items = hasMore ? rows.slice(0, limit) : rows;

  const threadIds = items.map((t) => t.id);
  const userIds = items.map((t) => t.user_id).filter(Boolean) as string[];

  const likeCounts: Record<string, number> = {};
  const messageCounts: Record<string, number> = {};
  const likedByMe: Record<string, boolean> = {};
  const profileMap: Record<string, { handle: string | null; display_name: string | null }> = {};

  if (threadIds.length > 0) {
    const [likeRes, messageRes, profileRes] = await Promise.all([
      supabase.from("likes").select("thread_id, user_id").in("thread_id", threadIds),
      supabase.from("messages").select("thread_id").in("thread_id", threadIds),
      supabase.from("profiles").select("id, handle, display_name").in("id", userIds),
    ]);

    for (const row of likeRes.data ?? []) {
      likeCounts[row.thread_id] = (likeCounts[row.thread_id] ?? 0) + 1;
      if (user && row.user_id === user.id) likedByMe[row.thread_id] = true;
    }

    for (const row of messageRes.data ?? []) {
      messageCounts[row.thread_id] = (messageCounts[row.thread_id] ?? 0) + 1;
    }

    for (const profile of profileRes.data ?? []) {
      profileMap[profile.id] = {
        handle: profile.handle,
        display_name: profile.display_name,
      };
    }
  }

  if (sort === "popular" || sort === "trending") {
    items = [...items].sort((a, b) => (likeCounts[b.id] ?? 0) - (likeCounts[a.id] ?? 0));
  }

  const result = items.map((thread) => ({
    id: thread.id,
    title: thread.title,
    genre: thread.genre,
    share_token: null,
    created_at: thread.created_at,
    updated_at: thread.updated_at,
    allow_prompt_fork: true,
    handle: thread.user_id ? profileMap[thread.user_id]?.handle ?? null : null,
    display_name: thread.user_id ? profileMap[thread.user_id]?.display_name ?? null : null,
    tags: thread.tags ?? [],
    message_count: messageCounts[thread.id] ?? 0,
    fork_count: 0,
    like_count: likeCounts[thread.id] ?? 0,
    liked_by_me: likedByMe[thread.id] ?? false,
  }));

  const lastItem = items[items.length - 1];
  const nextCursor = hasMore ? lastItem.created_at : null;

  return NextResponse.json({ items: result, nextCursor, hasMore });
}
