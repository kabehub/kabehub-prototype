import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ToastProvider } from "@/components/Toast";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0d9488",
};

export const metadata: Metadata = {
  metadataBase: new URL('https://kabehub.com'),  // ← この1行を追加
  title: 'KabeHub',
  description: '思考のGitHub。AIとの壁打ちを保存・公開・引継ぎできるプラットフォーム。',
  openGraph: {
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    images: ['/og-image.png'],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="ja">
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: `
  (function() {
    try {
      var raw = localStorage.getItem('kabehub_font_scale');
      var n = parseFloat(raw || '1');
      if (!isFinite(n)) n = 1;
      n = Math.min(1.5, Math.max(0.8, n));
      document.documentElement.style.setProperty('--font-scale', String(n));
    } catch (e) {
      // 既定値フォールバック: font scale読込失敗時は既定値(1.0)のまま表示する。
    }
  })();
`}} />
      </head>
      <body><ToastProvider>{children}</ToastProvider></body>
    </html>
  );
}
