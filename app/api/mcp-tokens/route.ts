import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { hashMcpToken } from "@/lib/mcp-token-hash";

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const { data, error } = await supabase
    .from("mcp_tokens")
    .select("id, name, created_at, last_used_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return finalizeJson({ error: error.message }, { status: 500 });
  return finalizeJson({ tokens: data });
}

export async function POST(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const body = await req.json().catch(() => ({}));
  const name: string | null = body.name ?? null;

  const rawToken = crypto.randomUUID();

  const tokenHash = await hashMcpToken(rawToken);

  const { data, error } = await supabase
    .from("mcp_tokens")
    .insert({ user_id: user.id, token_hash: tokenHash, name })
    .select("id, name, created_at, last_used_at")
    .single();

  if (error) return finalizeJson({ error: error.message }, { status: 500 });

  return finalizeJson({ token: rawToken, meta: data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const { id } = await req.json();
  if (!id) return finalizeJson({ error: "id is required" }, { status: 400 });

  const { error } = await supabase
    .from("mcp_tokens")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return finalizeJson({ error: error.message }, { status: 500 });
  return finalizeJson({ success: true });
}
