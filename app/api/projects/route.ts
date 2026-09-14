import { NextRequest } from "next/server";
import { mapProjectMemoryRpcError } from "@/lib/project-memory/map-rpc-error";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const { data, error } = await supabase
    .from("projects")
    .select("id, name")
    .eq("user_id", user.id);

  if (error) return finalizeJson({ error: error.message }, { status: 500 });
  return finalizeJson({ projects: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return finalizeJson({ error: "Invalid request body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return finalizeJson({ error: "Invalid request body" }, { status: 400 });
  }

  const requestBody = body as Record<string, unknown>;
  if (typeof requestBody.name !== "string") {
    return finalizeJson(
      { error: "name (string) is required" },
      { status: 400 },
    );
  }

  const projectName = requestBody.name.trim();
  if (projectName === "") {
    return finalizeJson({ error: "name is required" }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("get_or_create_project", {
    p_user_id: user.id,
    p_name: projectName,
  });

  if (error) {
    const mapped = mapProjectMemoryRpcError(error);
    return finalizeJson({ error: mapped.error }, { status: mapped.status });
  }

  return finalizeJson({
    success: true,
    project_id: data,
    name: projectName,
  });
}
