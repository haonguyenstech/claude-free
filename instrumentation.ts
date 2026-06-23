// Next.js instrumentation hook. Runs once per server process on boot. We only start the model
// health scheduler on the Node.js runtime (it touches SQLite + does real upstream calls, neither of
// which is available on the edge runtime).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startHealthScheduler } = await import("@/lib/proxy/health");
    startHealthScheduler();
  }
}
