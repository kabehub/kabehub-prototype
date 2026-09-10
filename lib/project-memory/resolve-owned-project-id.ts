import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveOwnedProjectIdByName(
  supabase: SupabaseClient,
  userId: string,
  name: string,
): Promise<
  | { ok: true; projectId: string | null }
  | { ok: false; status: 500; error: string }
> {
  const { data, error } = await supabase
    .from("projects")
    .select("id")
    .eq("user_id", userId)
    .eq("name", name)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: "Failed to resolve project" };
  return { ok: true, projectId: data?.id ?? null };
}
