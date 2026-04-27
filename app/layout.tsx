import type { Metadata } from "next";
import "./globals.css";

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
