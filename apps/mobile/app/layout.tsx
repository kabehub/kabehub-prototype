import type { ReactNode } from "react";
import type { Viewport } from "next";

import { MobileAuthBootstrap } from "../components/MobileAuthBootstrap";
import "./globals.css";

const contentSecurityPolicy = [
  "default-src 'self';",
  "script-src 'self' 'unsafe-inline';",
  "style-src 'self';",
  "img-src 'self' data:;",
  "connect-src 'self' https://www.kabehub.com https://lfrdzrdmrxmqqwmxmyxx.supabase.co;",
  "font-src 'self';",
  "object-src 'none';",
  "base-uri 'none';",
  "form-action 'self';",
  "frame-src 'none';",
].join(" ");

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <meta
          httpEquiv="Content-Security-Policy"
          content={contentSecurityPolicy}
        />
      </head>
      <body>
        <MobileAuthBootstrap />
        {children}
      </body>
    </html>
  );
}
