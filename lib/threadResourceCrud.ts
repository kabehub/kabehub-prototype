import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";

type BuildInsertResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string };

type ThreadResourceConfig = {
  table: string;
  orderBy: { column: string; ascending: boolean };
  addExplicitUserFilterOnGet: boolean;
  buildInsert: (args: { threadId: string; userId: string; body: any }) => BuildInsertResult;
};

export function createThreadResourceHandlers(config: ThreadResourceConfig) {
  async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const auth = await requireRouteUser(req);
    if (!auth.ok) return auth.response;
    const { user, supabase, finalizeJson } = auth;

    let query = supabase.from(config.table).select("*").eq("thread_id", params.id);
    if (config.addExplicitUserFilterOnGet) {
      query = query.eq("user_id", user.id);
    }
    query = query.order(config.orderBy.column, { ascending: config.orderBy.ascending });

    const { data, error } = await query;
    if (error) return finalizeJson({ error: error.message }, { status: 500 });
    return finalizeJson(data ?? []);
  }

  async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const auth = await requireRouteUser(req);
    if (!auth.ok) return auth.response;
    const { user, supabase, finalizeJson } = auth;

    const body = await req.json();
    const insertResult = config.buildInsert({ threadId: params.id, userId: user.id, body });
    if (!insertResult.ok) {
      return finalizeJson({ error: insertResult.error }, { status: 400 });
    }

    const { data, error } = await supabase
      .from(config.table)
      .insert(insertResult.payload)
      .select()
      .single();
    if (error) return finalizeJson({ error: error.message }, { status: 500 });
    return finalizeJson(data);
  }

  async function DELETE(req: NextRequest) {
    const auth = await requireRouteUser(req);
    if (!auth.ok) return auth.response;
    const { user, supabase, finalizeJson } = auth;

    const { id } = await req.json();
    const { error } = await supabase
      .from(config.table)
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) return finalizeJson({ error: error.message }, { status: 500 });
    return finalizeJson({ success: true });
  }

  return { GET, POST, DELETE };
}
