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
