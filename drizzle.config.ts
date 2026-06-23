import { defineConfig } from "drizzle-kit";

// For `drizzle-kit generate/push/studio` during development. The running app does NOT depend on
// generated migrations — it creates the schema idempotently on first open (src/lib/db/index.ts).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.CLAUDE_FREE_DB || "./claude-free.db",
  },
});
