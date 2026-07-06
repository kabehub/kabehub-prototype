/** @type {import('next').NextConfig} */
const nextConfig = {
  // canonical host: https://www.kabehub.com
  // 非www→wwwのリダイレクトはVercelのドメイン設定（Redirect to）側で設定済み。
  // ここに重複してredirects()を書かないこと（二重管理防止）。
};
module.exports = nextConfig;
