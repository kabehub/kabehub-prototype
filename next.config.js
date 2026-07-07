/** @type {import('next').NextConfig} */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
let supabaseHttpOrigin = "";
let supabaseWsOrigin = "";

if (supabaseUrl) {
  try {
    const origin = new URL(supabaseUrl).origin;
    supabaseHttpOrigin = origin;
    supabaseWsOrigin = origin.replace(/^http/, "ws");
  } catch {
    supabaseHttpOrigin = "";
    supabaseWsOrigin = "";
  }
}

const scriptSrc = [
  "'self'",
  "'unsafe-inline'", // TODO: replace unsafe-inline with nonces when CSP is enforced.
  ...(process.env.NODE_ENV !== "production" ? ["'unsafe-eval'"] : []),
];
const imgSrc = ["'self'", "data:", "blob:", ...(supabaseHttpOrigin ? [supabaseHttpOrigin] : [])];
const connectSrc = [
  "'self'",
  ...(supabaseHttpOrigin ? [supabaseHttpOrigin] : []),
  ...(supabaseWsOrigin ? [supabaseWsOrigin] : []),
];

const cspReportOnly = [
  "default-src 'self'",
  `script-src ${scriptSrc.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  `img-src ${imgSrc.join(" ")}`,
  `connect-src ${connectSrc.join(" ")}`,
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
].join("; ");

const nextConfig = {
  // canonical host: https://www.kabehub.com
  // 非www→wwwのリダイレクトはVercelのドメイン設定（Redirect to）側で設定済み。
  // ここに重複してredirects()を書かないこと（二重管理防止）。
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy-Report-Only",
            value: cspReportOnly,
          },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
