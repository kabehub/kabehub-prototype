import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createRouteHandlerSupabaseClient } from "@/lib/supabase/route-handler";

export async function POST(
  req: NextRequest,
  { params }: { params: { token: string } }
) {
  // 認証チェック（フォーク先は自分のアカウント）
  const authSupabase = createRouteHandlerSupabaseClient(req, new NextResponse());
  const { data: { user }, error: authError } = await authSupabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // share_token でスレッドを取得（認証不要クライアントで公開データを読む）
  const { data: sourceThread, error: threadError } = await supabase
    .from("threads")
    .select("id, title, is_public, hide_memos, allow_prompt_fork, system_prompt")
    .eq("share_token", params.token)
    .single();

  if (threadError || !sourceThread || !sourceThread.is_public) {
    return NextResponse.json({ error: "Not Found" }, { status: 404 });
  }

  // メッセージ取得
  const { data: sourceMessages, error: messagesError } = await supabase
    .from("messages")
    .select("role, content, provider, created_at, is_hidden") // ← 追加
    .eq("thread_id", sourceThread.id)
    .order("created_at", { ascending: true });

  if (messagesError) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }

  // hide_memos が true の場合はメモを除外
  const messages = sourceThread.hide_memos
    ? (sourceMessages ?? []).filter((m) => m.provider !== "memo")
    : (sourceMessages ?? []);

  // allow_prompt_fork が false の場合はシステムプロンプトをコピーしない
  const systemPrompt = sourceThread.allow_prompt_fork
    ? (sourceThread.system_prompt ?? "")
    : "";

  // 新スレッド作成
  const { data: newThread, error: newThreadError } = await authSupabase
    .from("threads")
    .insert({
      title: `Fork of ${sourceThread.title}`,
      user_id: user.id,
      system_prompt: systemPrompt,
      forked_from_id: sourceThread.id,
    })
    .select()
    .single();

  if (newThreadError || !newThread) {
    return NextResponse.json({ error: "Failed to create thread" }, { status: 500 });
  }

// メッセージ一括コピー ← ここを丸ごと置き換え
if (messages.length > 0) {
  let hiddenCount = 0;

  const newMessages = messages.map((m) => {
    let content = m.content;

    // 1. [[text]] 記法を物理的に黒塗り（is_hidden に関わらず全メッセージに適用）
    content = content.replace(/\[\[(.*?)\]\]/gs, "████");

    // 2. is_hidden=true はプレースホルダーに置換
    if (m.is_hidden) {
      content = "🔒 [このメッセージは非公開に設定されています]";
      hiddenCount++;
    }

    return {
      role: m.role,
      content,
      provider: m.provider,
      thread_id: newThread.id,
      user_id: user.id,
      parent_id: null,
      created_at: m.created_at,
      is_hidden: false, // フォーク先ではフラグをリセット
    };
  });

  const { error: insertError } = await authSupabase
    .from("messages")
    .insert(newMessages);

  if (insertError) {
    await authSupabase.from("threads").delete().eq("id", newThread.id);
    return NextResponse.json({ error: "Failed to copy messages" }, { status: 500 });
  }

  return NextResponse.json({
    thread: newThread,
    prompt_forked: sourceThread.allow_prompt_fork,
    hidden_count: hiddenCount, // Toast通知用
  });
}

// ↓ 追加
  await authSupabase.rpc("increment_fork_count", { p_thread_id: sourceThread.id });

  return NextResponse.json({
    thread: newThread,
    prompt_forked: sourceThread.allow_prompt_fork,
    hidden_count: 0,
  });;
}