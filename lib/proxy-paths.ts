/**
 * proxy.ts の config.matcher と対になるパス／メソッド判定。
 *
 * Next.js の制約により config.matcher は文字列リテラルでなければならず
 * （変数・String.raw 不可、ビルド時に静的解析される）、本ファイルから
 * 生成することはできない。したがって matcher と本ファイルは物理的に
 * 二重定義であり、両者の対応関係（境界整合性）は
 * scripts/proxy.test.cjs のマトリクステストで保証する。
 * どちらか一方を変更したら必ず両方とテストを更新すること。
 *
 * matcher が「proxy() 自体を起動するか」を決めるのに対し、
 * shouldRunSupabaseSessionCheck() は「起動した proxy() の中で
 * Supabase Cookie セッションを確認するか」を決める、別概念の判定である。
 * /api/share/[token] の公開GETのように、matcherは通す（true）が
 * セッション確認はしない（false）という非対称な組み合わせが意図的に存在する。
 */

const PROTECTED_STATIC_PAGES = new Set([
  "/stats",
  "/memory",
  "/album",
  "/arena",
  "/calendar",
  "/image",
  "/novel-check",
]);

/**
 * MB-dで新たにログイン必須化した8ページの判定。
 * 末尾スラッシュは正規化して比較する。
 * /arena/[token]・/threads/[id]（tree以外）は対象外。
 */
export function isProtectedPagePath(pathname: string): boolean {
  const normalizedPath =
    pathname.length > 1 && pathname.endsWith("/")
      ? pathname.slice(0, -1)
      : pathname;

  if (PROTECTED_STATIC_PAGES.has(normalizedPath)) return true;

  return /^\/threads\/[^/]+\/tree$/.test(normalizedPath);
}

/**
 * 未ログイン時にproxyがnextを生成し、ログイン後の復帰を許可する保護ページ。
 * shouldRunSupabaseSessionCheck() のページ判定条件のうち、/login は含まない
 * （/login はセッション確認対象だがnext復帰先としては不適格なため）。
 */
export function isProtectedRedirectPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    isProtectedPagePath(pathname)
  );
}

/**
 * 公開共有ページ。next復帰先として許可する。
 * /api/share/[token] の isPublicShareReadApi() と同じ「単一セグメントのみ」境界。
 */
export function isShareRedirectPath(pathname: string): boolean {
  return /^\/share\/[^/]+\/?$/.test(pathname);
}

/**
 * app/auth/callback/route.ts が受け取る未信頼の next クエリ値を検証する。
 * - 相対/絶対を問わずoriginで解決し、同一origin以外は拒否
 * - query/hash付きは拒否
 * - 正規化後のpathnameに対して許可判定を行う（dot-segment等によるすり抜け防止）
 * 戻り値: 許可する場合は正規化済みURL、拒否する場合はnull
 */
export function resolveAllowedNextRedirect(
  rawNext: string | null,
  origin: string
): URL | null {
  if (!rawNext) return null;

  let target: URL;
  try {
    target = new URL(rawNext, origin);
  } catch {
    return null;
  }

  if (target.origin !== origin) return null;
  if (target.search || target.hash) return null;

  if (
    isProtectedRedirectPath(target.pathname) ||
    isShareRedirectPath(target.pathname)
  ) {
    return target;
  }

  return null;
}

/** Bearer認証専用のMCP API。Supabase Cookieセッションを参照しない。 */
export function isMcpBearerApi(pathname: string): boolean {
  return pathname === "/api/mcp" || pathname.startsWith("/api/mcp/");
}

/**
 * セッション確認を免除してよい公開share読み取りAPI。
 * 対応する実Routeは GET /api/share/[token] のみ。
 *
 * ⚠️ トークン配下の子パス（fork 等）は全て保護側。share配下にRouteを
 *    追加しても自動的にセッション確認対象になる（fail-closed）。
 *
 * ⚠️ GET/HEAD以外のメソッドは同一パスであっても免除しない。
 *    将来 POST /api/share/[token] 等を追加した場合、そのRouteは
 *    自動的にセッション確認対象になる（fail-closed）。
 *
 * ⚠️ 本関数は /api/share/ 直下の単一セグメントを全てトークンとみなす。
 *    /api/share/stats のような静的Routeを直下に追加する場合、そのRouteは
 *    誤って免除対象になりうるため、本関数の見直しが必須。
 */
export function isPublicShareReadApi(pathname: string, method: string): boolean {
  const isReadMethod = method === "GET" || method === "HEAD";
  return isReadMethod && /^\/api\/share\/[^/]+\/?$/.test(pathname);
}
