import type { ReactNode } from "react";

import { MobileAuthBootstrap } from "../components/MobileAuthBootstrap";

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
