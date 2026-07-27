import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { resolveAllowedNextRedirect } from "@/lib/proxy-paths";

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
      const userId = data.session?.user?.id;
      let handle: string | null = null;

      if (userId) {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("handle")
          .eq("id", userId)
          .single();

        if (!profileError) {
          handle = profile?.handle ?? null;
        }
      }

      // 取得エラー・レコードなし・handle未設定（userId欠落を含む）は
      // すべて同じ未設定状態として扱い、nextを参照せずオンボーディングへ送る。
      if (!handle) {
        return NextResponse.redirect(`${origin}/settings?onboarding=true`);
      }

      const target = resolveAllowedNextRedirect(
        searchParams.get("next"),
        origin
      );
      if (target) {
        return NextResponse.redirect(target.toString());
      }

      return NextResponse.redirect(`${origin}/`);
    }
  }

  // エラー時はloginページへ
  return NextResponse.redirect(`${origin}/login`);
}
