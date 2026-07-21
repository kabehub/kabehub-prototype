// service_role専用。Cron・管理バッチ処理専用のクライアント。
// Cookie/ユーザーセッションは一切扱わない。
// MCP Bearer認証専用のlib/mcp-auth.tsとは独立して保つこと
// （lib/github-token-store.tsが現状mcp-auth.tsのserviceRoleClientを
// 流用している件は別チケットで対応。ここでは触らない）。

import { createClient } from "@supabase/supabase-js";

export function createAdminSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "[admin] NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
