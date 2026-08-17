import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Proofweave — Personal deep research",
  description:
    "A local-first workspace for shaping, reading, and preserving cited research reports.",
};

export const viewport: Viewport = {
  colorScheme: "light",
  themeColor: "#f3eee3",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
