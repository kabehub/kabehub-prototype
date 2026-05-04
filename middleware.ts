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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = req.nextUrl;

  // 未ログインかつ保護ページへのアクセス → /login へリダイレクト
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
    // ✅v32: 保護が必要なページのみを明示的に指定する方式に変更
    // 未指定のパス（/[handle], /explore, /share, /arena等）はmiddlewareをスキップ
    "/",
    "/settings/:path*",
    "/login",
    "/api/((?!mcp|share).*)",
  ],
};
