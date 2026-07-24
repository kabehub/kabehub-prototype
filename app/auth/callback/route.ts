import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

  // ⚠️ このファイルはSupabase Auth（Googleログイン）専用のコールバックです。
  // GitHub連携のコールバックは app/api/auth/github/callback/route.ts です。
  // 過去にこの2ファイルの処理が混同されていた経緯があるため、絶対に混同しないこと。

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get("code");

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // next が /share/ で始まる場合のみ許可（オープンリダイレクト対策）
      const next = searchParams.get("next");
      if (next && next.startsWith("/share/")) {
        return NextResponse.redirect(`${origin}${next}`);
      }

      // ③ handle未設定ならオンボーディングへ
      const userId = data.session?.user?.id;
      if (userId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("handle")
          .eq("id", userId)
          .single();

        if (!profile?.handle) {
          return NextResponse.redirect(`${origin}/settings?onboarding=true`);
        }
      }

      return NextResponse.redirect(`${origin}/`);
    }
  }

  // エラー時はloginページへ
  return NextResponse.redirect(`${origin}/login`);
}
