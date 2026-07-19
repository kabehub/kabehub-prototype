import { NextRequest, NextResponse } from "next/server";
import { serviceRoleClient } from "@/lib/mcp-auth";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import type { ParentGenreId } from "@/lib/genres";

export const dynamic = "force-dynamic";

type PublicThreadRow = {
  id: string;
  title: string | null;
  is_public: boolean;
  created_at: string;
  updated_at: string | null;
  user_id: string | null;
  genre: string | null;
  share_token: string | null;
  tags: string[] | null;
  likes_count?: number | null;
  fork_count?: number | null;
  allow_prompt_fork?: boolean | null;
};

type SortCursor = {
  likes_count: number;
  cursor_at: string;
  id: string;
};

function parseSortCursor(cursor: string | null): SortCursor | null {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(cursor) as Partial<SortCursor>;
    if (
      typeof parsed.likes_count === "number" &&
      typeof parsed.cursor_at === "string" &&
      typeof parsed.id === "string"
    ) {
      return parsed as SortCursor;
    }
  } catch {
    return null;
  }
  return null;
}

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
  const requestedSort = searchParams.get("sort");
  const sort: "newest" | "popular" | "trending" =
    requestedSort === "popular" || requestedSort === "trending"
      ? requestedSort
      : "newest";
  const cursor = searchParams.get("cursor") ?? null;
  const limit = 20;

  let rows: PublicThreadRow[] = [];
  let queryError: { message: string } | null = null;

  if (sort === "popular" || sort === "trending") {
    const adminSupabase = serviceRoleClient();
    const cursorData = parseSortCursor(cursor);
    const timestampColumn = sort === "popular" ? "created_at" : "updated_at";
    const tagJoin = tag ? ", thread_tags!inner(name)" : "";

    let dbQuery = adminSupabase
      .from("threads")
      .select(`id, title, is_public, created_at, updated_at, user_id, genre, share_token, likes_count, fork_count, allow_prompt_fork${tagJoin}`)
      .eq("is_public", true)
      .order("likes_count", { ascending: false, nullsFirst: false })
      .order(timestampColumn, { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .limit(limit + 1);

    if (query) {
      dbQuery = dbQuery.ilike("title", `%${query}%`);
    }

    if (tag) {
      dbQuery = dbQuery.eq("thread_tags.name", tag);
    }

    if (genre) {
      dbQuery = dbQuery.eq("genre", genre);
    } else if (parentGenre) {
      if (parentGenre === "other") {
        dbQuery = dbQuery.is("genre", null);
      } else {
        const { getChildIds } = await import("@/lib/genres");
        const childIds = getChildIds(parentGenre as ParentGenreId);
        if (childIds.length > 0) {
          dbQuery = dbQuery.in("genre", childIds);
        }
      }
    }

    if (cursorData) {
      dbQuery = dbQuery.or(
        [
          `likes_count.lt.${cursorData.likes_count}`,
          `and(likes_count.eq.${cursorData.likes_count},${timestampColumn}.lt.${cursorData.cursor_at})`,
          `and(likes_count.eq.${cursorData.likes_count},${timestampColumn}.eq.${cursorData.cursor_at},id.lt.${cursorData.id})`,
        ].join(",")
      );
    }

    const { data, error } = await dbQuery;
    rows = (data ?? []) as unknown as PublicThreadRow[];
    queryError = error;
  } else {
    let dbQuery = supabase
      .from("public_threads_view")
      .select("id, title, is_public, created_at, updated_at, user_id, genre, share_token, tags, allow_prompt_fork, fork_count")
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
        const childIds = getChildIds(parentGenre as ParentGenreId);
        if (childIds.length > 0) {
          dbQuery = dbQuery.in("genre", childIds);
        }
      }
    }

    if (cursor) {
      dbQuery = dbQuery.lt("created_at", cursor);
    }

    const { data, error } = await dbQuery;
    rows = (data ?? []) as PublicThreadRow[];
    queryError = error;
  }

  if (queryError) {
    console.error("explore API error:", queryError);
    return NextResponse.json({ error: queryError.message }, { status: 500 });
  }

  const hasMore = rows.length > limit;
  let items = hasMore ? rows.slice(0, limit) : rows;

  const threadIds = items.map((t) => t.id);
  const userIds = items.map((t) => t.user_id).filter(Boolean) as string[];

  const likeCounts: Record<string, number> = {};
  const messageCounts: Record<string, number> = {};
  const likedByMe: Record<string, boolean> = {};
  const profileMap: Record<string, { handle: string | null; display_name: string | null }> = {};
  const tagMap: Record<string, string[]> = {};

  if (threadIds.length > 0) {
    const [likeRes, messageRes, profileRes, tagRes] = await Promise.all([
      supabase.from("likes").select("thread_id, user_id").in("thread_id", threadIds),
      supabase.from("messages").select("thread_id").in("thread_id", threadIds),
      supabase.from("profiles").select("id, handle, display_name").in("id", userIds),
      supabase.from("thread_tags").select("thread_id, name").in("thread_id", threadIds),
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

    for (const tagRow of tagRes.data ?? []) {
      if (!tagMap[tagRow.thread_id]) tagMap[tagRow.thread_id] = [];
      tagMap[tagRow.thread_id].push(tagRow.name);
    }
  }

  const result = items.map((thread) => ({
    id: thread.id,
    title: thread.title,
    genre: thread.genre,
    share_token: thread.share_token,
    created_at: thread.created_at,
    updated_at: thread.updated_at,
    allow_prompt_fork: thread.allow_prompt_fork ?? false,
    handle: thread.user_id ? profileMap[thread.user_id]?.handle ?? null : null,
    display_name: thread.user_id ? profileMap[thread.user_id]?.display_name ?? null : null,
    tags: tagMap[thread.id] ?? thread.tags ?? [],
    message_count: messageCounts[thread.id] ?? 0,
    fork_count: thread.fork_count ?? 0,
    like_count: likeCounts[thread.id] ?? 0,
    liked_by_me: likedByMe[thread.id] ?? false,
  }));

  const lastItem = items[items.length - 1];
  const nextCursor = hasMore
    ? sort === "popular" || sort === "trending"
      ? JSON.stringify({
          likes_count: lastItem.likes_count ?? 0,
          cursor_at: sort === "popular" ? lastItem.created_at : lastItem.updated_at ?? lastItem.created_at,
          id: lastItem.id,
        })
      : lastItem.created_at
    : null;

  return NextResponse.json({ items: result, nextCursor, hasMore });
}
