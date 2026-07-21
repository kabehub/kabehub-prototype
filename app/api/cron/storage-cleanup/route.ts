import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { removeStoragePaths } from "@/lib/supabase/storage-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CANDIDATE_LIMIT = 50;

type CandidateRow = { storage_path: string };

function getCleanupMode(
  dryRunValue: string | undefined
): "dry_run" | "delete" {
  return dryRunValue === "false" ? "delete" : "dry_run";
}

function selectCandidatePaths(candidateRows: CandidateRow[]) {
  return {
    limitReached: candidateRows.length > CANDIDATE_LIMIT,
    paths: candidateRows
      .slice(0, CANDIDATE_LIMIT)
      .map((row) => row.storage_path),
  };
}

export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("[storage-cleanup-cron] CRON_SECRET is not configured");
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminSupabaseClient();
  const mode = getCleanupMode(process.env.STORAGE_CLEANUP_DRY_RUN);
  const isDryRun = mode === "dry_run";

  const { data: run, error: insertError } = await supabase
    .from("storage_cleanup_runs")
    .insert({ status: "running", mode })
    .select("id")
    .single();

  if (insertError || !run) {
    console.error("[storage-cleanup-cron] failed to record run start", {
      message: insertError?.message,
    });
    // 履歴記録に失敗しても本処理は継続する（履歴は補助情報のため）
  }
  const runId = run?.id ?? null;

  // limit_reached判定のため、上限+1件を要求してからスライスする
  const { data: candidateRows, error: rpcError } = await supabase.rpc(
    "find_orphan_storage_candidates",
    { p_limit: CANDIDATE_LIMIT + 1 }
  );

  if (rpcError) {
    console.error("[storage-cleanup-cron] candidate RPC failed", {
      message: rpcError.message,
    });
    if (runId) {
      await supabase
        .from("storage_cleanup_runs")
        .update({ status: "failed", finished_at: new Date().toISOString() })
        .eq("id", runId);
    }
    return NextResponse.json({ error: "candidate lookup failed" }, { status: 500 });
  }

  const selection = selectCandidatePaths((candidateRows ?? []) as CandidateRow[]);
  const { limitReached, paths } = selection;

  if (isDryRun) {
    if (runId) {
      await supabase
        .from("storage_cleanup_runs")
        .update({
          status: "succeeded",
          finished_at: new Date().toISOString(),
          candidate_count: paths.length,
          limit_reached: limitReached,
        })
        .eq("id", runId);
    }
    return NextResponse.json({
      mode: "dry_run",
      candidateCount: paths.length,
      limitReached,
    });
  }

  const result =
    paths.length > 0
      ? await removeStoragePaths(supabase, paths)
      : {
          attemptedCount: 0,
          succeededCount: 0,
          failedCount: 0,
          errorCodes: [],
        };

  const status = result.failedCount > 0 ? "partial_failure" : "succeeded";

  if (runId) {
    await supabase
      .from("storage_cleanup_runs")
      .update({
        status,
        finished_at: new Date().toISOString(),
        candidate_count: paths.length,
        limit_reached: limitReached,
        succeeded_count: result.succeededCount,
        failed_count: result.failedCount,
        error_codes: result.errorCodes,
      })
      .eq("id", runId);
  }

  if (result.failedCount > 0) {
    console.error("[storage-cleanup-cron] some deletions failed", {
      attemptedCount: result.attemptedCount,
      failedCount: result.failedCount,
    });
    return NextResponse.json(
      { mode: "delete", ...result, limitReached },
      { status: 500 }
    );
  }

  return NextResponse.json({ mode: "delete", ...result, limitReached });
}
