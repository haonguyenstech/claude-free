// CLI backend: forward a request through a local `claude` CLI process (host's Claude Code login).
// Ports claude-proxy.js:426-565. `claude -p` is non-interactive and emits one block at exit, so —
// exactly like the original — nothing is written until the child exits, and only THEN do we decide
// the response status (a JSON 502 on failure, or a 200 buffered/SSE answer on success).
/* eslint-disable @typescript-eslint/no-explicit-any */

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import pathMod from "node:path";
import { jsonError } from "./errors";
import { makeSseResponse } from "./sse";

// Cap concurrent `claude -p` fallbacks. Each is a full, heavy process; without a ceiling a burst of
// parallel tool calls / subagents (or a dashboard "test all" across every CLI model) could fork-bomb
// the host and burn tokens. Excess requests get a fast 503 instead of piling on. Override via env.
const MAX_CONCURRENT_CLI = Math.max(1, Number(process.env.CLI_MAX_CONCURRENT) || 4);
let activeCli = 0;

// 8 MB ceiling on buffered child output — a runaway model can't grow stdout until the server OOMs.
const MAX_CLI_OUTPUT = 8 * 1024 * 1024;

// Signal the child's whole process GROUP when possible (it's spawned detached, so it leads its own
// group). child.kill() alone signals only the direct child and orphans any grandchildren it spawned —
// the classic "claude process won't die" leak. Falls back to a plain kill on any failure / Windows.
function killTree(child: ReturnType<typeof spawn>, sig: NodeJS.Signals) {
  try {
    if (process.platform !== "win32" && typeof child.pid === "number") {
      process.kill(-child.pid, sig);
      return;
    }
  } catch {
    /* group gone or already dead — fall through to a direct kill */
  }
  try {
    child.kill(sig);
  } catch {}
}

// Resolve an absolute path to the `claude` binary. A daemonized server (launchd) often runs with a
// minimal PATH that omits ~/.local/bin, so a bare spawn("claude") fails with ENOENT. Try, in order:
// CLAUDE_BIN, `which/where claude`, then common install locations. Cached after the first lookup.
let _claudeBin: string | null | undefined;
export function resolveClaudeBin(): string | null {
  if (_claudeBin !== undefined) return _claudeBin;
  const tryWhich = process.platform === "win32" ? "where claude" : "command -v claude 2>/dev/null";
  const candidates: string[] = [];
  if (process.env.CLAUDE_BIN) candidates.push(process.env.CLAUDE_BIN);
  try {
    const out = execSync(tryWhich, { encoding: "utf8" }).split(/\r?\n/)[0].trim();
    if (out) candidates.push(out);
  } catch {}
  const home = process.env.HOME || process.env.USERPROFILE || "";
  if (home) candidates.push(pathMod.join(home, ".local/bin/claude"));
  candidates.push("/opt/homebrew/bin/claude", "/usr/local/bin/claude");
  for (const c of candidates) {
    try {
      if (c && fs.existsSync(c)) {
        _claudeBin = c;
        return c;
      }
    } catch {}
  }
  _claudeBin = null;
  return null;
}

function buildPrompt(areq: any): string {
  let prompt = "";
  if (typeof areq.system === "string") prompt += areq.system + "\n\n";
  else if (Array.isArray(areq.system)) prompt += areq.system.map((b: any) => b.text || "").join("\n") + "\n\n";
  for (const m of areq.messages || []) {
    if (typeof m.content === "string") {
      prompt += (m.role === "user" ? "" : m.role + ": ") + m.content + "\n";
      continue;
    }
    if (!Array.isArray(m.content)) continue;
    for (const b of m.content) {
      if (b.type === "text") prompt += (m.role === "user" ? "" : m.role + ": ") + b.text + "\n";
    }
  }
  return prompt;
}

function buildEnv(model: string): NodeJS.ProcessEnv {
  // The spawned `claude` authenticates with the host's own Claude Code login, NOT the incoming proxy
  // access token (which only gates this proxy). Pin a real token via CLI_AUTH_TOKEN if desired.
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (process.env.CLI_AUTH_TOKEN) env.ANTHROPIC_AUTH_TOKEN = process.env.CLI_AUTH_TOKEN;
  else delete env.ANTHROPIC_AUTH_TOKEN; // fall back to the host's stored Claude Code login
  // Never let the child inherit a base URL pointing back at this proxy (would loop). Force direct.
  delete env.ANTHROPIC_BASE_URL;
  if (model) env.ANTHROPIC_MODEL = model;
  env.ANTHROPIC_SMALL_FAST_MODEL = "claude-haiku-4-5-20251001";
  return env;
}

// Last-resort fallback for `cli/claude-*` when no subscription token or API key is available: run the
// local `claude -p`, a one-shot TEXT generator. It can't speak the tool-use protocol (no tool_use
// blocks), so tools/subagents won't work on this path — but the primary route (forwardClaudeCli ->
// api.anthropic.com with the host's subscription login) does support them fully.
export function forwardViaCLI(
  areq: any,
  model: string,
  signal: AbortSignal,
  onComplete?: (info: { outputTokens: number; inputTokens?: number }) => void,
): Promise<Response> {
  const claudeBin = resolveClaudeBin();
  if (!claudeBin) {
    return Promise.resolve(
      jsonError(502, "`claude` CLI not found — install it (npm install -g @anthropic-ai/claude-code) or set CLAUDE_BIN to its path"),
    );
  }
  // Request already cancelled before we spawned — never launch a heavy process for a dead client.
  if (signal.aborted) return Promise.resolve(new Response(null, { status: 499 }));

  // Concurrency backpressure: refuse rather than fork-bomb. Far cheaper than a hung, overloaded host.
  if (activeCli >= MAX_CONCURRENT_CLI) {
    return Promise.resolve(
      jsonError(
        503,
        `too many concurrent claude CLI fallbacks (${activeCli}/${MAX_CONCURRENT_CLI}) — retry shortly, or configure a subscription/API key so requests use the direct (non-spawning) path`,
      ),
    );
  }

  const prompt = buildPrompt(areq);
  const env = buildEnv(model);
  const child = spawn(claudeBin, ["-p", prompt.trim()], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32", // lead a process group so killTree() reaps grandchildren
  });
  activeCli++;

  // Auto-kill lifecycle. Each request owns its own child + handlers (no shared state).
  //  - client disconnect (signal abort) while the child is still running -> SIGTERM the group, then
  //    escalate to SIGKILL after a short grace (don't wait out the 120s cap once the client is gone).
  //  - killTimer is a hard cap: SIGKILL a hung claude (whole group) so it can't leak forever.
  let completed = false;
  let escalateTimer: ReturnType<typeof setTimeout> | undefined;
  const killTimer = setTimeout(() => killTree(child, "SIGKILL"), 120000);
  const onAbort = () => {
    if (!completed) {
      killTree(child, "SIGTERM");
      if (!escalateTimer) escalateTimer = setTimeout(() => killTree(child, "SIGKILL"), 3000);
    }
  };
  signal.addEventListener("abort", onAbort);
  let released = false;
  const cleanup = () => {
    if (released) return; // idempotent: 'error' and 'exit' can both fire — decrement activeCli once
    released = true;
    clearTimeout(killTimer);
    if (escalateTimer) clearTimeout(escalateTimer);
    signal.removeEventListener("abort", onAbort);
    activeCli--;
  };

  let stdout = "";
  let stderr = "";
  let killedForSize = false;
  child.stdout?.on("data", (c) => {
    stdout += c.toString("utf8");
    if (stdout.length > MAX_CLI_OUTPUT && !killedForSize) {
      killedForSize = true; // runaway output — kill the group; the buffered prefix is still returned
      killTree(child, "SIGKILL");
    }
  });
  child.stderr?.on("data", (c) => {
    if (stderr.length < 64 * 1024) stderr += c.toString("utf8"); // bound stderr too
  });

  const done = new Promise<{ code: number | null; err: NodeJS.ErrnoException | null }>((resolve) => {
    child.on("error", (e) => {
      cleanup();
      resolve({ code: null, err: e as NodeJS.ErrnoException });
    });
    child.on("exit", (code) => {
      cleanup();
      resolve({ code, err: null });
    });
  });

  return done.then(({ code, err }) => {
    // Client already gone (disconnected / we killed the child on their behalf) — nothing to send.
    if (signal.aborted) return new Response(null, { status: 499 });
    if (err) {
      const msg =
        err.code === "ENOENT"
          ? "`claude` CLI not found — install it: npm install -g @anthropic-ai/claude-code"
          : "failed to spawn claude CLI: " + err.message;
      return jsonError(502, msg);
    }
    if (killedForSize) {
      return jsonError(502, `claude CLI output exceeded ${MAX_CLI_OUTPUT} bytes and was terminated`);
    }
    if (code !== 0 && !stdout) {
      return jsonError(502, "claude CLI exited with code " + code + (stderr ? ": " + stderr.slice(0, 200) : ""));
    }
    const text = stdout.trim();
    completed = true;
    const inEst = Math.ceil(JSON.stringify(areq.messages || "").length / 4);
    const reportDone = (outputTokens: number) => {
      if (onComplete) {
        try {
          onComplete({ outputTokens, inputTokens: inEst || undefined });
        } catch {}
      }
    };

    if (areq.stream) {
      // Pseudo-streaming: the answer is already complete, so emit all SSE events in order and close.
      const msgId = "msg_" + Date.now();
      const outEst = Math.ceil(text.length / 4);
      reportDone(outEst);
      return makeSseResponse((sink) => {
        sink.ev("message_start", {
          message: { id: msgId, type: "message", role: "assistant", model: model || "claude", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } },
        });
        sink.ev("content_block_start", { index: 0, content_block: { type: "text", text: "" } });
        if (text) sink.ev("content_block_delta", { index: 0, delta: { type: "text_delta", text } });
        sink.ev("content_block_stop", { index: 0 });
        sink.ev("message_delta", { delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: outEst } });
        sink.ev("message_stop", {});
        sink.close();
      }, signal);
    }

    return Response.json({
      id: "msg_" + Date.now(),
      type: "message",
      role: "assistant",
      model: model || "claude",
      content: text ? [{ type: "text", text }] : [],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: Math.ceil(JSON.stringify(areq.messages || "").length / 4), output_tokens: Math.ceil(text.length / 4) },
    });
  });
}
