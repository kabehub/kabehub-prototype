import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // セッションを更新（これを呼ばないとCookieが失効する）
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = req.nextUrl;

  // 未ログインかつ保護ページへのアクセス → /login へリダイレクト（nextパラメータ付き）
  if (!user && pathname !== "/login" && pathname !== "/auth/callback") {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ログイン済みで /login にアクセスしたら / へリダイレクト
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  return res;
}

export const config = {
  matcher: [
    /*
     * 以下を除いた全パスに適用：
     * - _next/static / _next/image（静的ファイル）
     * - favicon.ico
     * - /share/... （ログイン不要の公開ページ）
     * - /api/share/... （公開ページ用API）
     */
    "/((?!_next/static|_next/image|favicon.ico|share|api/share|arena/).*)",
  ],
};
