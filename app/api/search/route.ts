import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q")?.trim() ?? "";
  const target = searchParams.get("target") ?? "both"; // "title" | "message" | "both"

  if (!query) {
    const { data, error } = await supabase
      .from("threads")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) return finalizeJson({ error }, { status: 500 });
    return finalizeJson(data ?? []);
  }

  const pattern = `%${query}%`;
  const threadIds = new Set<string>();
  const matchedMsgMap = new Map<string, string[]>();

  if (target === "both") {
    const [titleRes, msgRes] = await Promise.all([
      supabase.from("threads").select("id").ilike("title", pattern).eq("user_id", user.id),
      supabase.from("messages").select("id, thread_id").ilike("content", pattern).eq("user_id", user.id),
    ]);
    const searchError = titleRes.error ?? msgRes.error;
    if (searchError) {
      return finalizeJson({ error: searchError.message }, { status: 500 });
    }
    (titleRes.data ?? []).forEach((t) => threadIds.add(t.id));
    (msgRes.data ?? []).forEach((m) => {
      threadIds.add(m.thread_id);
      const existing = matchedMsgMap.get(m.thread_id) ?? [];
      matchedMsgMap.set(m.thread_id, [...existing, m.id]);
    });
  } else if (target === "title") {
    const { data, error } = await supabase.from("threads").select("id").ilike("title", pattern).eq("user_id", user.id);
    if (error) {
      return finalizeJson({ error: error.message }, { status: 500 });
    }
    (data ?? []).forEach((t) => threadIds.add(t.id));
  } else if (target === "message") {
    const { data, error } = await supabase.from("messages").select("id, thread_id").ilike("content", pattern).eq("user_id", user.id);
    if (error) {
      return finalizeJson({ error: error.message }, { status: 500 });
    }
    (data ?? []).forEach((m) => {
      threadIds.add(m.thread_id);
      const existing = matchedMsgMap.get(m.thread_id) ?? [];
      matchedMsgMap.set(m.thread_id, [...existing, m.id]);
    });
  }

  if (threadIds.size === 0) {
    return finalizeJson([]);
  }

  const { data, error } = await supabase
    .from("threads")
    .select("*")
    .in("id", Array.from(threadIds))
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return finalizeJson({ error }, { status: 500 });

  const result = (data ?? []).map((t) => ({
    ...t,
    matchedMessageIds: matchedMsgMap.get(t.id) ?? [],
  }));

  return finalizeJson(result);
}
