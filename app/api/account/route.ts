import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";
import {
  listAllObjectPathsUnderPrefix,
  removeStoragePaths,
} from "@/lib/supabase/storage-cleanup";
import { isOwnedStoragePath } from "@/lib/storage-path-guard";

export async function DELETE(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createRouteHandlerSupabaseClient(req, res);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let objectPaths: string[];
  try {
    objectPaths = await listAllObjectPathsUnderPrefix(supabase, user.id);
  } catch {
    console.error("[account-delete] storage listing failed", {
      scope: "account",
    });
    return NextResponse.json(
      { error: "アカウント削除の準備に失敗しました。時間をおいて再度お試しください。" },
      { status: 500 }
    );
  }

  const ownedPaths = objectPaths.filter((path) =>
    isOwnedStoragePath(path, user.id)
  );
  if (ownedPaths.length !== objectPaths.length) {
    console.error("[account-delete] unexpected path in listing result", {
      scope: "account",
    });
    return NextResponse.json(
      { error: "アカウント削除の準備に失敗しました。時間をおいて再度お試しください。" },
      { status: 500 }
    );
  }

  if (ownedPaths.length > 0) {
    const cleanup = await removeStoragePaths(supabase, ownedPaths);
    if (cleanup.failedCount > 0) {
      console.error("[account-delete] storage removal incomplete", {
        scope: "account",
        attemptedCount: cleanup.attemptedCount,
        failedCount: cleanup.failedCount,
      });
      return NextResponse.json(
        { error: "データの削除に失敗しました。時間をおいて再度お試しください。" },
        { status: 500 }
      );
    }
  }

  const { error: rpcError } = await supabase.rpc("delete_current_user");
  if (rpcError) {
    console.error("[account-delete] delete_current_user RPC failed", {
      scope: "account",
    });
    return NextResponse.json(
      { error: "アカウント削除に失敗しました。時間をおいて再度お試しください。" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
