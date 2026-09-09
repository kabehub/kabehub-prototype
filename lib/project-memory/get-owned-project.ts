import type { SupabaseClient } from "@supabase/supabase-js";

export async function getOwnedProject(
  supabase: SupabaseClient,
  userId: string,
  projectId: string,
) {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return { ok: false as const, status: 500, error: "Failed to load project" };
  if (!data) return { ok: false as const, status: 404, error: "Project not found" };
  return { ok: true as const };
}
