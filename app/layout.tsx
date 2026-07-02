import type { Metadata } from "next";
import { Google_Sans_Flex, Google_Sans_Code } from "next/font/google";
import "./globals.css";

// Same typeface pair as antigravity.google: Google Sans Flex (UI) + Google Sans Code (mono).
// Self-hosted via next/font so there's no runtime dependency on fonts.googleapis.com.
// adjustFontFallback: false — Next's font-metrics table doesn't cover these newer faces yet,
// so it logs "Failed to find font override values" on every build. Explicit fallbacks instead.
const sans = Google_Sans_Flex({
  subsets: ["latin"],
  variable: "--font-gsans-flex",
  adjustFontFallback: false,
  fallback: ["system-ui", "arial"],
});
const mono = Google_Sans_Code({
  subsets: ["latin"],
  variable: "--font-gsans-code",
  adjustFontFallback: false,
  fallback: ["ui-monospace", "monospace"],
});

export const metadata: Metadata = {
  title: {
    default: "claude-free — run Claude Code on free models",
    template: "%s · claude-free",
  },
  description: "A local proxy that runs Claude Code on free AI models. Manage models, keys, and traffic.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
