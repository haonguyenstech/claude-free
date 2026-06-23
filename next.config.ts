import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Self-contained server build: `.next/standalone/server.js` + minimal node_modules.
  // Keeps the deploy close to today's single-artifact model (copy standalone -> ~/.claude-free).
  output: "standalone",
  // better-sqlite3 is a native module — don't bundle it; require() it at runtime.
  serverExternalPackages: ["better-sqlite3"],
  reactStrictMode: true,
};

export default nextConfig;
