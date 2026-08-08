import { NextRequest } from "next/server";
import { requireRouteUser } from "@/lib/supabase/route-auth";
import { isOwnedStoragePath } from "@/lib/storage-path-guard";
import { securityGuardRejected } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireRouteUser(req);
  if (!auth.ok) return auth.response;
  const { user, supabase, finalizeJson } = auth;

  const url = new URL(req.url);
  const page = parseInt(url.searchParams.get("page") ?? "0", 10);
  const PAGE_SIZE = 20;

  const { data: messages, error, count } = await supabase
    .from("messages")
    .select("id, thread_id, created_at, content, metadata", { count: "exact" })
    .eq("user_id", user.id)
    .eq("provider", "image_gen")
    .neq("metadata->>image_deleted", "true")
    .order("created_at", { ascending: false })
    .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

  if (error) return finalizeJson({ error }, { status: 500 });

  const rawStoragePaths = (messages ?? []).map(
    (m: Record<string, unknown>) =>
      (m.metadata as Record<string, unknown> | null)?.storagePath
  );

  const checkedStoragePaths = rawStoragePaths.map((path) => ({
    path,
    isOwned: isOwnedStoragePath(path, user.id),
  }));

  const storagePaths = checkedStoragePaths
    .filter((item): item is { path: string; isOwned: true } => item.isOwned)
    .map((item) => item.path);

  const skippedCount = checkedStoragePaths.filter(
    (item) => Boolean(item.path) && !item.isOwned
  ).length;

  if (skippedCount > 0) {
    securityGuardRejected({ operation: "album-storage-path-check", skippedCount });
  }

  const signedUrls: Record<string, string> = {};
  if (storagePaths.length > 0) {
    const { data: urlData, error: urlError } = await supabase.storage
      .from("generated-images")
      .createSignedUrls(storagePaths, 3600);
    if (urlError) {
      console.warn("[album] createSignedUrls failed", {
        error: urlError.message,
        pathCount: storagePaths.length,
      });
    }
    if (urlData) {
      for (const item of urlData) {
        if (item.signedUrl && item.path) signedUrls[item.path] = item.signedUrl;
      }
    }
  }

  const items = (messages ?? []).map((m: Record<string, unknown>) => {
    const meta = m.metadata as Record<string, unknown> | null;
    const storagePath = meta?.storagePath as string | null;
    return {
      ...m,
      signedUrl: storagePath ? signedUrls[storagePath] ?? null : null,
    };
  });

  const total = count ?? 0;
  return finalizeJson({
    items,
    total,
    hasMore: (page + 1) * PAGE_SIZE < total,
  });
}
