import { NextRequest, NextResponse } from "next/server";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { purgeThread } from "@/lib/threads/purge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const THREAD_TRASH_PURGE_BATCH = 50;
const TIME_BUDGET_MS = 40_000;
const LOG_PREFIX = "[thread-trash-purge-cron]";

type Candidate = { id: string };

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error(LOG_PREFIX, { errorCode: "CRON_NOT_CONFIGURED" });
    return NextResponse.json({ error: "Cron is not configured" }, { status: 500 });
  }
  if (req.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let serviceClient: ReturnType<typeof createAdminSupabaseClient>;
  try {
    serviceClient = createAdminSupabaseClient();
  } catch {
    console.error(LOG_PREFIX, { errorCode: "ADMIN_CLIENT_FAILED" });
    return NextResponse.json({ error: "Admin client initialization failed" }, { status: 500 });
  }

  let candidates: Candidate[];
  try {
    const { data, error } = await serviceClient.rpc("list_expired_trashed_threads", {
      p_limit: THREAD_TRASH_PURGE_BATCH + 1,
    });
    if (error) {
      console.error(LOG_PREFIX, { errorCode: error.code ?? "unknown" });
      return NextResponse.json({ error: "candidate lookup failed" }, { status: 500 });
    }
    candidates = (data ?? []) as Candidate[];
  } catch {
    console.error(LOG_PREFIX, { errorCode: "CANDIDATE_LOOKUP_FAILED" });
    return NextResponse.json({ error: "candidate lookup failed" }, { status: 500 });
  }

  const selected = candidates.slice(0, THREAD_TRASH_PURGE_BATCH);
  const limitReached = candidates.length > THREAD_TRASH_PURGE_BATCH;
  const mode = process.env.THREAD_TRASH_PURGE_DRY_RUN === "false" ? "delete" : "dry_run";
  console.info(LOG_PREFIX, { event: "start", mode, candidateCount: selected.length });

  if (mode === "dry_run") {
    for (const candidate of selected) {
      console.info(LOG_PREFIX, { threadId: candidate.id });
    }
    const result = { mode, candidateCount: selected.length, limitReached };
    console.info(LOG_PREFIX, { event: "finish", ...result });
    return NextResponse.json(result);
  }

  const counts = {
    attemptedCount: 0,
    deletedCount: 0,
    notFoundCount: 0,
    errorCount: 0,
    storageFailedCount: 0,
  };
  const errorCodes = new Set<string>();
  let timeBudgetReached = false;
  for (const candidate of selected) {
    // Finish an in-flight purge; the budget only prevents starting another one.
    if (Date.now() - startedAt > TIME_BUDGET_MS) {
      timeBudgetReached = true;
      break;
    }
    counts.attemptedCount += 1;
    try {
      const result = await purgeThread({ mode: "cron", serviceClient, threadId: candidate.id });
      if (result.outcome === "deleted") {
        counts.deletedCount += 1;
        counts.storageFailedCount += result.storage.failedCount;
        if (result.storage.failedCount > 0) {
          for (const errorCode of new Set(result.storage.errorCodes.length ? result.storage.errorCodes : ["unknown"])) {
            errorCodes.add(errorCode);
            console.warn(LOG_PREFIX, { threadId: candidate.id, errorCode });
          }
        }
      } else if (result.outcome === "not_found") {
        counts.notFoundCount += 1;
      } else {
        counts.errorCount += 1;
        const errorCode = result.errorCode ?? "unknown";
        errorCodes.add(errorCode);
        console.error(LOG_PREFIX, { threadId: candidate.id, errorCode });
      }
    } catch {
      counts.errorCount += 1;
      errorCodes.add("PURGE_EXCEPTION");
      console.error(LOG_PREFIX, { threadId: candidate.id, errorCode: "PURGE_EXCEPTION" });
    }
  }

  const result = { mode, ...counts, limitReached, timeBudgetReached, errorCodes: [...errorCodes] };
  console.info(LOG_PREFIX, { event: "finish", ...result });
  return NextResponse.json(result, { status: counts.errorCount > 0 ? 500 : 200 });
}
