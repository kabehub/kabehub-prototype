import { NextRequest } from "next/server";
import { AiProviderRequestError, createEmbedding } from "@/lib/lore/openai";
import { mapProjectMemoryRpcError } from "@/lib/project-memory/map-rpc-error";
import { requireRouteUser } from "@/lib/supabase/route-auth";

export const dynamic = "force-dynamic";

type RouteProps = { params: Promise<{ projectId: string }> };

type LorePromotion = {
  topic_id: string;
  expected_revision: number;
  embedding: number[];
};

export async function DELETE(req: NextRequest, props: RouteProps) {
  const { projectId } = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return finalizeJson({ error: "Invalid request body" }, { status: 400 });
  }

  const requestBody =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : null;
  const promoteToLore = requestBody?.promoteToLore;
  if (typeof promoteToLore !== "boolean") {
    return finalizeJson(
      { error: "promoteToLore (boolean) is required" },
      { status: 400 },
    );
  }

  const lorePromotions: LorePromotion[] = [];
  if (promoteToLore) {
    const openaiKey = req.headers.get("x-openai-api-key");
    if (!openaiKey) {
      return finalizeJson(
        { error: "x-openai-api-key header required" },
        { status: 400 },
      );
    }

    const { data: topics, error: topicsError } = await supabase
      .from("project_memory_topics")
      .select("id, content_md, revision")
      .eq("project_id", projectId)
      .eq("user_id", user.id);

    if (topicsError) {
      return finalizeJson({ error: topicsError.message }, { status: 500 });
    }

    const nonEmpty = (topics ?? []).filter(
      (topic) => topic.content_md.trim() !== "",
    );

    try {
      for (const topic of nonEmpty) {
        const embedding = await createEmbedding(openaiKey, topic.content_md);
        lorePromotions.push({
          topic_id: topic.id,
          expected_revision: topic.revision,
          embedding,
        });
      }
    } catch (err) {
      const status =
        err instanceof AiProviderRequestError ? (err.status ?? 502) : 502;
      const message =
        err instanceof Error
          ? err.message
          : "OpenAI APIへのリクエストに失敗しました";
      return finalizeJson({ error: message }, { status });
    }
  }

  const { error } = await supabase.rpc("delete_project_preserving_contents", {
    p_user_id: user.id,
    p_project_id: projectId,
    p_promote_to_lore: promoteToLore,
    p_lore_promotions: promoteToLore ? lorePromotions : [],
  });

  if (error) {
    const mapped = mapProjectMemoryRpcError(error);
    return finalizeJson({ error: mapped.error }, { status: mapped.status });
  }

  return finalizeJson({ success: true });
}
