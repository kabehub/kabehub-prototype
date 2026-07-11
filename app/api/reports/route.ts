import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

function createServiceRoleSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service role configuration is missing");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export async function POST(req: NextRequest) {
  let body: { threadId?: unknown; reason?: unknown };
  try {
    const text = await req.text();
    body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { threadId, reason } = body;

  if (!threadId || typeof threadId !== "string") {
    return NextResponse.json({ error: "threadId is required" }, { status: 400 });
  }
  if (!reason || typeof reason !== "string") {
    return NextResponse.json({ error: "reason is required" }, { status: 400 });
  }
  if (reason.length > 1000) {
    return NextResponse.json({ error: "reason must be 1000 characters or fewer" }, { status: 400 });
  }

  // IPアドレス取得（プロキシ経由の場合は先頭のみ）
  const forwardedFor = req.headers.get("x-forwarded-for");
  const reporterIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";

  // ログイン中ユーザーのIDを取得（未ログインはnull）
  const supabase = createRouteHandlerSupabaseClient(req, new NextResponse());
  const { data: { user } } = await supabase.auth.getUser();
  const reporterUserId = user?.id ?? null;

  // SECURITY DEFINER RPC経由でinsert（service_role専用）
  let error;
  try {
    const serviceRoleSupabase = createServiceRoleSupabaseClient();
    ({ error } = await serviceRoleSupabase.rpc("submit_report", {
      p_thread_id: threadId,
      p_reason: reason,
      p_reporter_user_id: reporterUserId,
      p_reporter_ip: reporterIp,
    }));
  } catch (serviceRoleError) {
    console.error("通報用Supabaseクライアントの初期化エラー:", serviceRoleError);
    return NextResponse.json({ error: "報告の送信に失敗しました" }, { status: 500 });
  }

  if (error) {
    if (error.message.includes("duplicate_report")) {
      return NextResponse.json(
        { error: "この投稿はすでに報告済みです（24時間以内）" },
        { status: 429 }
      );
    }
    console.error("通報保存エラー:", error);
    return NextResponse.json({ error: "報告の送信に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
