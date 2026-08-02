import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { LORE_MEMORY_SELECT } from "@/lib/lore/selects";
import { createEmbedding } from "@/lib/lore/openai";
import type { LorePatchRequest } from "@/types";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const id = params.id;
  const body = await req.json().catch(() => null) as LorePatchRequest | null;
  if (!body || typeof body.action !== "string") {
    return finalizeJson({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    if (body.action === "archive") {
      const { data: target, error: targetError } = await supabase
        .from("lore_embeddings")
        .select("is_pinned")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (targetError) return finalizeJson({ error: targetError.message }, { status: 500 });
      if (!target) return finalizeJson({ error: "Not found" }, { status: 404 });
      if (target.is_pinned === true) {
        return finalizeJson(
          { error: "固定済みの記憶はアーカイブできません。先に固定を解除してください。" },
          { status: 409 },
        );
      }
    }

    const updates: Record<string, unknown> = {};
    const now = new Date().toISOString();
    let currentMemoryKind: string | null = null;

    if (body.action === "update_text" || body.action === "update_meta") {
      const { data: target, error: targetError } = await supabase
        .from("lore_embeddings")
        .select("memory_kind")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (targetError) return finalizeJson({ error: targetError.message }, { status: 500 });
      if (!target) return finalizeJson({ error: "Not found" }, { status: 404 });
      currentMemoryKind = target.memory_kind;
    }

    const markManualCorrectionIfKindChanged = () => {
      if (body.action !== "update_text" && body.action !== "update_meta") return;
      if (!body.memoryKind) return;
      if (body.memoryKind !== currentMemoryKind) {
        updates.is_manually_corrected = true;
      }
    };

    switch (body.action) {
      case "update_text": {
        const chunkText = body.chunkText?.trim();
        if (!chunkText) {
          return finalizeJson({ error: "chunkText is required" }, { status: 400 });
        }

        const openaiKey = req.headers.get("x-openai-api-key");
        if (!openaiKey) {
          return finalizeJson({ error: "x-openai-api-key header required" }, { status: 400 });
        }

        updates.chunk_text = chunkText;
        updates.embedding = await createEmbedding(openaiKey, chunkText);
        updates.extraction_version = "user_edited";
        updates.last_confirmed_at = now;
        if (body.memoryKind) updates.memory_kind = body.memoryKind;
        if (body.temporalStatus) updates.temporal_status = body.temporalStatus;
        markManualCorrectionIfKindChanged();
        break;
      }

      case "update_meta": {
        if (!body.memoryKind && !body.temporalStatus) {
          return finalizeJson({ error: "memoryKind or temporalStatus is required" }, { status: 400 });
        }

        updates.extraction_version = "user_edited";
        if (body.memoryKind) updates.memory_kind = body.memoryKind;
        if (body.temporalStatus) updates.temporal_status = body.temporalStatus;
        markManualCorrectionIfKindChanged();
        break;
      }

      case "pin":
        updates.is_pinned = body.isPinned;
        break;

      case "confirm_current":
        updates.temporal_status = "current";
        updates.last_confirmed_at = now;
        updates.valid_until = null;
        break;

      case "archive":
        updates.is_archived = true;
        break;

      default:
        return finalizeJson({ error: "Invalid action" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("lore_embeddings")
      .update(updates)
      .eq("id", id)
      .eq("user_id", user.id)
      .select(LORE_MEMORY_SELECT)
      .maybeSingle();

    if (error) return finalizeJson({ error: error.message }, { status: 500 });
    if (!data) return finalizeJson({ error: "Not found" }, { status: 404 });

    return finalizeJson(data);
  } catch (err) {
    return finalizeJson({ error: (err as Error).message }, { status: 500 });
  }
}
