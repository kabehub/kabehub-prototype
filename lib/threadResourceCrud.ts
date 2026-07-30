import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

type BuildInsertResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string };

type ThreadResourceConfig = {
  table: string;
  orderBy: { column: string; ascending: boolean };
  addExplicitUserFilterOnGet: boolean;
  buildInsert: (args: { threadId: string; userId: string; body: any }) => BuildInsertResult;
};

export function createThreadResourceFinalizers(authResponse: NextResponse) {
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

export function createThreadResourceHandlers(config: ThreadResourceConfig) {
  async function GET(req: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const authResponse = new NextResponse();
    const supabase = createRouteHandlerSupabaseClient(req, authResponse);
    const { finalizeJson } = createThreadResourceFinalizers(authResponse);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return finalizeJson({ error: "Unauthorized" }, { status: 401 });

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
    const authResponse = new NextResponse();
    const supabase = createRouteHandlerSupabaseClient(req, authResponse);
    const { finalizeJson } = createThreadResourceFinalizers(authResponse);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return finalizeJson({ error: "Unauthorized" }, { status: 401 });

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
    const authResponse = new NextResponse();
    const supabase = createRouteHandlerSupabaseClient(req, authResponse);
    const { finalizeJson } = createThreadResourceFinalizers(authResponse);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return finalizeJson({ error: "Unauthorized" }, { status: 401 });

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
