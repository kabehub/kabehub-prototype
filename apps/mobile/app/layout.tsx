import type { ReactNode } from "react";
import type { Viewport } from "next";

import { MobileAuthBootstrap } from "../components/MobileAuthBootstrap";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <MobileAuthBootstrap />
        {children}
      </body>
    </html>
  );
}
