import Link from "next/link";
import { ReactNode } from "react";

interface LegalLayoutProps {
  title: string;
  updatedAt: string;
  children: ReactNode;
}

export default function LegalLayout({ title, updatedAt, children }: LegalLayoutProps) {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link href="/" className="legal-header-logo">KabeHub</Link>
        <span className="legal-header-sep">/</span>
        <span className="legal-header-label">{title}</span>
      </header>

      <main className="legal-container">
        <h1 className="legal-title">{title}</h1>
        <p className="legal-updated">最終更新日: {updatedAt}</p>

        {children}

        <nav className="legal-footer-nav">
          <Link href="/terms">利用規約</Link>
          <Link href="/privacy">プライバシーポリシー</Link>
          <Link href="/legal">特定商取引法に基づく表記</Link>
          <Link href="/">KabeHubに戻る</Link>
        </nav>
      </main>
    </div>
  );
}
