import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
