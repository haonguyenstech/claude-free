#!/usr/bin/env node
// claude-free — cross-platform picker/launcher for free AI models via the local proxy.
// Works on Windows (cmd/PowerShell), macOS, and Linux. Arrow keys to pick a model,
// reasoning mode, and permission mode, then it launches Claude Code pointed at the proxy.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const readline = require("readline");

const VERSION = "1.3.0";
const DIR = __dirname;
// No fixed port by default — the proxy binds an OS-assigned free port and records it in proxy.json,
// so claude-free never collides with whatever else you're running. Set CLAUDE_FREE_PORT to force one.
const FORCED_PORT = process.env.CLAUDE_FREE_PORT ? Number(process.env.CLAUDE_FREE_PORT) : null;
const STATE_FILE = path.join(DIR, "proxy.json");
const PROXY_FILE = path.join(DIR, "claude-proxy.js");
const KEYS_FILE = path.join(DIR, "keys.json");
const SMALL_MODEL = "deepseek-v4-flash-free";
// Where --update pulls the latest files from (override with CLAUDE_FREE_BASE).
const UPDATE_BASE = process.env.CLAUDE_FREE_BASE || "https://raw.githubusercontent.com/haonguyenstech/claude-free/main";

// Model catalog. tier groups the picker; tps is from the local benchmark (tokens/sec, single-sample,
// rough), ctx is the context window, star marks the recommended pick in each tier. Ordered by tps.
// { name, id, key (service or null), tier, ctx, tps, note, star }
const MODELS = [
  // --- FREE · no key needed --- (tps re-measured 2026-06-19: median of 3, 512-tok sustained, end-to-end via proxy)
  { name: "Big Pickle",        id: "big-pickle",            key: null, tier: "free", ctx: "",   tps: 111, note: "stealth, fast & clean" },
  { name: "MiMo Auto",         id: "mimo-auto",             key: null, tier: "free", ctx: "1M", tps: 108, note: "free, no key" },
  { name: "DeepSeek V4 Flash", id: "deepseek-v4-flash-free",key: null, tier: "free", ctx: "",   tps: 107, note: "fast, clean · small model" },
  { name: "North Mini Code",   id: "north-mini-code-free",  key: null, tier: "free", ctx: "",   tps: 96,  note: "fast coding model",        star: true },
  { name: "MiMo V2.5",         id: "mimo-v2.5-free",        key: null, tier: "free", ctx: "",   tps: 85,  note: "reasoning (shows thinking)" },
  { name: "Nemotron 3 Ultra",  id: "nemotron-3-ultra-free", key: null, tier: "free", ctx: "",   tps: 10,  note: "550B, deepest · slow" },
  // --- ZenMux free models: $0 (payg, no quota) but need the web cookie like the pro models ---
  { name: "Step 3.7 Flash",    id: "pro/step-3.7-free",     key: "sub", tier: "zfree", ctx: "256K", tps: 100, note: "thinking-heavy · variable · free" },
  { name: "GLM 4.7 Flash",     id: "pro/glm-4.7-free",      key: "sub", tier: "zfree", ctx: "200K", tps: 57,  note: "fast & clean · free" },
  { name: "Kimi K2.7 Code",    id: "pro/kimi-k2.7-free",    key: "sub", tier: "zfree", ctx: "256K", tps: 54,  note: "coding · fast · free",      star: true },
  { name: "GLM 5.2 Free",      id: "pro/glm-5.2-free",      key: "sub", tier: "zfree", ctx: "1M",   tps: 42,  note: "flagship · newest · free" },
  // --- subscription models (cookie-authenticated; neutral pro/ aliases resolved by the proxy) ---
  { name: "Step 3.7 Flash",    id: "pro/step-3.7-flash",    key: "sub", tier: "pro", ctx: "256K", tps: 98, note: "fastest, thinking-heavy" },
  { name: "Kimi K2.7 Code",    id: "pro/kimi-k2.7-code",    key: "sub", tier: "pro", ctx: "256K", tps: 77, note: "strong coding" },
  { name: "DeepSeek V4 Flash", id: "pro/deepseek-v4-flash", key: "sub", tier: "pro", ctx: "1M",   tps: 74, note: "fast" },
  { name: "DeepSeek V4 Pro",   id: "pro/deepseek-v4-pro",   key: "sub", tier: "pro", ctx: "1M",   tps: 71, note: "best balance" },
  { name: "Gemini 3.1 Pro",    id: "pro/gemini-3.1-pro",    key: "sub", tier: "pro", ctx: "1M",   tps: 69, note: "flagship · slow TTFT" },
  { name: "MiniMax M3",        id: "pro/minimax-m3",        key: "sub", tier: "pro", ctx: "512K", tps: 67, note: "concise" },
  { name: "Qwen3.7 Plus",      id: "pro/qwen3.7-plus",      key: "sub", tier: "pro", ctx: "1M",   tps: 54, note: "verbose, thorough" },
  { name: "GLM 4.7",           id: "pro/glm-4.7",           key: "sub", tier: "pro", ctx: "200K", tps: 52, note: "fast & clean" },
  { name: "Qwen3.7 Max",       id: "pro/qwen3.7-max",       key: "sub", tier: "pro", ctx: "1M",   tps: 0,  note: "PAYG only · not in plan" },
  { name: "Kimi K2.7 Code HS", id: "pro/kimi-k2.7-code-hs", key: "sub", tier: "pro", ctx: "256K", tps: 0,  note: "PAYG only · not in plan" },
  { name: "Grok 4.3",          id: "pro/grok-4.3",          key: "sub", tier: "pro", ctx: "1M",   tps: 0,  note: "PAYG only · not in plan" },
];

const TIER_LABEL = {
  free:  "  \x1b[1;38;5;208mFREE\x1b[0m \x1b[2m· no key needed\x1b[0m",
  zfree: "  \x1b[1;38;5;208mFREE PRO\x1b[0m \x1b[2m· Free\x1b[0m",
  pro:   "  \x1b[1;38;5;39mPRO\x1b[0m \x1b[2m· subscription\x1b[0m",
};
// Temporarily hide whole tiers from the picker/--models (models still launch by id). To restore
// the PRO group, just empty this set: const HIDE_TIERS = new Set();
const HIDE_TIERS = new Set(["pro"]);
// One model row. Selected rows are drawn in reverse video (no inner color, so the highlight is solid);
// unselected rows color the speed badge by throughput (green fast / yellow mid / dim slow).
function fmtRow(m, sel) {
  const star = m.star ? "⭐" : "  ";
  const name = m.name.padEnd(18);
  const tps = ((m.tps || "?") + " tok/s").padStart(10);
  const ctx = (m.ctx || "").padStart(5);
  if (sel) return `\x1b[7m ❯ ${star} ${name}${tps}  ${ctx}  ${m.note} \x1b[0m`;
  const c = m.tps >= 50 ? 32 : m.tps >= 25 ? 33 : 90;
  return `    ${star} ${name}\x1b[${c}m${tps}\x1b[0m  \x1b[90m${ctx}\x1b[0m  \x1b[90m${m.note}\x1b[0m`;
}
// Build the grouped entry list for menuRich: a spacer + label header at each tier change, then rows.
function modelMenuEntries() {
  const entries = []; let tier = null;
  MODELS.forEach((m, i) => {
    if (HIDE_TIERS.has(m.tier)) return;
    if (m.tier !== tier) { entries.push({ header: "" }); entries.push({ header: TIER_LABEL[m.tier] }); tier = m.tier; }
    entries.push({ value: i, render: (sel) => fmtRow(m, sel) });
  });
  return entries;
}

function loadKeys() { try { return JSON.parse(fs.readFileSync(KEYS_FILE, "utf8")); } catch { return {}; } }
function saveKeys(k) { try { fs.writeFileSync(KEYS_FILE, JSON.stringify(k, null, 2)); } catch {} }
function getKey(service) {
  const env = process.env[service.toUpperCase() + "_API_KEY"];
  if (env) return env;
  return loadKeys()[service] || "";
}
function ask(q) {
  return new Promise((r) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); r(a.trim()); }); });
}

// Generic arrow-key single-select menu. Resolves the chosen index, or -1 if cancelled.
function menu(title, items) {
  return new Promise((resolve) => {
    let sel = 0;
    const stdin = process.stdin;
    const render = (first) => {
      const lines = [
        `\x1b[1m${title}\x1b[0m  (Up/Down move, Enter select, q quit)`,
        ...items.map((it, i) => (i === sel ? `\x1b[7m  > ${it}\x1b[0m` : `    ${it}`)),
      ];
      // Redraw in place. Crucially, emit NO trailing newline: a newline printed while the menu
      // sits at the bottom row scrolls the top line into scrollback — that's the duplicate-title
      // bug. Each line gets \x1b[K to clear any leftover from a previous, longer render.
      if (!first) process.stdout.write(`\x1b[${lines.length - 1}A`);
      process.stdout.write("\r" + lines.map((l) => l + "\x1b[K").join("\n"));
    };
    readline.emitKeypressEvents(stdin);
    if (stdin.isTTY) stdin.setRawMode(true);
    process.stdout.write("\x1b[?25l");
    render(true);
    const done = (val) => {
      stdin.removeListener("keypress", onKey);
      if (stdin.isTTY) stdin.setRawMode(false);
      process.stdout.write("\x1b[?25h\n");
      resolve(val);
    };
    const onKey = (str, key) => {
      if (!key) return;
      if (key.name === "up" || key.name === "k") sel = (sel - 1 + items.length) % items.length;
      else if (key.name === "down" || key.name === "j") sel = (sel + 1) % items.length;
      else if (key.name === "return") return done(sel);
      else if (key.name === "q" || (key.ctrl && key.name === "c")) return done(-1);
      else return;
      render(false);
    };
    stdin.on("keypress", onKey);
  });
}

// Grouped single-select menu. `entries` is an ordered mix of:
//   { header: text }                  — non-selectable label/spacer (skipped by navigation)
//   { value, render(selected) }       — selectable row; `value` is returned on Enter
// Returns the chosen entry's `value`, or -1 if cancelled. Same in-place redraw as menu().
function menuRich(title, entries) {
  const pick = entries.map((e, i) => (e.header === undefined ? i : -1)).filter((i) => i >= 0);
  return new Promise((resolve) => {
    let pos = 0;
    const stdin = process.stdin;
    const render = (first) => {
      const lines = [`\x1b[1m${title}\x1b[0m  \x1b[2m↑/↓ move · enter select · q quit\x1b[0m`];
      entries.forEach((e, i) => lines.push(e.header === undefined ? e.render(i === pick[pos]) : e.header));
      if (!first) process.stdout.write(`\x1b[${lines.length - 1}A`);
      process.stdout.write("\r" + lines.map((l) => l + "\x1b[K").join("\n"));
    };
    readline.emitKeypressEvents(stdin);
    if (stdin.isTTY) stdin.setRawMode(true);
    process.stdout.write("\x1b[?25l");
    render(true);
    const done = (val) => {
      stdin.removeListener("keypress", onKey);
      if (stdin.isTTY) stdin.setRawMode(false);
      process.stdout.write("\x1b[?25h\n");
      resolve(val);
    };
    const onKey = (str, key) => {
      if (!key) return;
      if (key.name === "up" || key.name === "k") pos = (pos - 1 + pick.length) % pick.length;
      else if (key.name === "down" || key.name === "j") pos = (pos + 1) % pick.length;
      else if (key.name === "return") return done(entries[pick[pos]].value);
      else if (key.name === "q" || (key.ctrl && key.name === "c")) return done(-1);
      else return;
      render(false);
    };
    stdin.on("keypress", onKey);
  });
}

function readState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return null; } }

// Content hash of the proxy source on disk — matched against the running proxy's recorded
// srcHash so we can auto-restart it whenever claude-proxy.js changes (no more stale proxy).
function proxyFileHash() {
  try { return crypto.createHash("sha256").update(fs.readFileSync(PROXY_FILE)).digest("hex").slice(0, 16); }
  catch { return ""; }
}

// Confirm a *claude-free* proxy is alive on this port (not some unrelated service that grabbed it).
// Our proxy answers GET / with a 404 body containing "use POST /v1/messages".
function isOurProxy(port) {
  return new Promise((resolve) => {
    const req = http.request({ host: "127.0.0.1", port, path: "/", method: "GET", timeout: 1000 }, (res) => {
      let b = ""; res.on("data", (c) => (b += c)); res.on("end", () => resolve(b.includes("use POST /v1/messages")));
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// Port of a live, reusable claude-free proxy, or null if none.
async function runningProxyPort() {
  const st = readState();
  if (st && st.port && (await isOurProxy(st.port))) return st.port;
  return null;
}

// Ensure a proxy is running and return the port to talk to.
async function ensureProxy() {
  const existing = await runningProxyPort();
  if (existing) {
    // Reuse only if the running proxy matches the current source. If claude-proxy.js changed
    // (e.g. after an edit/update), the recorded srcHash won't match — restart so the fix takes effect.
    const st = readState();
    if (st && st.srcHash && st.srcHash === proxyFileHash()) return existing;
    console.log("> proxy source changed — restarting proxy");
    if (st && st.pid) { try { process.kill(st.pid); } catch {} }
    for (let i = 0; i < 30 && (await runningProxyPort()); i++) await new Promise((r) => setTimeout(r, 100));
  }
  try { fs.unlinkSync(STATE_FILE); } catch {}   // drop stale state before starting fresh
  const out = fs.openSync(path.join(DIR, "claude-proxy.log"), "a");
  const env = { ...process.env };
  if (FORCED_PORT) env.CLAUDE_FREE_PORT = String(FORCED_PORT);
  const child = spawn(process.execPath, [PROXY_FILE], { detached: true, windowsHide: true, stdio: ["ignore", out, out], env });
  child.unref();
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    const p = await runningProxyPort();
    if (p) { console.log("> started claude-proxy on :" + p); return p; }
  }
  console.error("! proxy did not start; see " + path.join(DIR, "claude-proxy.log"));
  return FORCED_PORT;
}

function stopProxy() {
  const st = readState();
  if (!st || !st.pid) { console.log("No claude-free proxy is running."); return; }
  try { process.kill(st.pid); console.log("Stopped claude-free proxy (pid " + st.pid + ", was on :" + st.port + ")."); }
  catch { console.log("Proxy already gone; cleared stale state."); }
  try { fs.unlinkSync(STATE_FILE); } catch {}
}

// ---- CLI flags ----
function printHelp() {
  console.log(`claude-free v${VERSION}  -  run Claude Code on free AI models

Usage:
  claude-free [options] [-- <claude args...>]

Options:
  -h, --help       show this help and exit
  -v, --version    print the version and exit
  -u, --update     update claude-free to the latest version from GitHub
      --models     list the available models and exit
      --stop       stop the background proxy

Run with no options to pick a model interactively, then launch Claude Code.
Anything after "--" is passed straight through to the underlying 'claude' command,
e.g.  claude-free -- --resume

The proxy auto-picks a free port (shown in the picker as "proxy on :PORT").
Environment:
  CLAUDE_FREE_PORT   force a specific proxy port (default: an OS-assigned free port)
  CLAUDE_FREE_BASE   source for --update (default: this repo's GitHub raw)`);
}

function printModels() {
  console.log(`claude-free v${VERSION}  -  available models:\n`);
  for (const m of MODELS) {
    if (HIDE_TIERS.has(m.tier)) continue;
    const tag = m.key ? "(subscription)" : "(no key)";
    console.log(`  ${m.id.padEnd(40)} ${tag}\n    ${m.name} — ${m.note}${m.ctx ? " · " + m.ctx + " ctx" : ""}${m.tps ? " · ~" + m.tps + " tok/s" : ""}`);
  }
}

// Download a URL to a string, following redirects (GitHub raw -> CDN).
function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return download(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error("HTTP " + res.statusCode)); }
      let d = ""; res.setEncoding("utf8"); res.on("data", (c) => (d += c)); res.on("end", () => resolve(d));
    }).on("error", reject);
  });
}

async function selfUpdate() {
  console.log(`Updating claude-free (v${VERSION}) from ${UPDATE_BASE} ...`);
  for (const f of ["claude-proxy.js", "claude-free.js"]) {
    process.stdout.write("  " + f + " ... ");
    try {
      const body = await download(UPDATE_BASE + "/" + f);
      if (!body || body.length < 200) throw new Error("download too small, aborting");
      fs.writeFileSync(path.join(DIR, f), body);
      console.log("ok (" + body.length + " bytes)");
    } catch (e) {
      console.error("FAILED: " + e.message);
      console.error("Update aborted; your existing files are unchanged.");
      process.exit(1);
    }
  }
  console.log("\nUpdated. The next launch auto-restarts the proxy if it changed — just run claude-free.");
}

// Orange->gold ASCII wordmark, one palette color per line.
function printLogo() {
  const pal = [196, 202, 208, 214, 220];
  const art = [
    "  ____ _                 _        _____",
    " / ___| | __ _ _   _  __| | ___  |  ___|_ __ ___  ___",
    "| |   | |/ _` | | | |/ _` |/ _ \\ | |_ | '__/ _ \\/ _ \\",
    "| |___| | (_| | |_| | (_| |  __/ |  _|| | |  __/  __/",
    " \\____|_|\\__,_|\\__,_|\\__,_|\\___| |_|  |_|  \\___|\\___|",
  ];
  art.forEach((line, i) => console.log("\x1b[1;38;5;" + pal[i] + "m" + line + "\x1b[0m"));
  console.log("   \x1b[2mfree AI models\x1b[0m");
}

async function main() {
  // Flags before "--" are ours; everything after "--" is forwarded to claude.
  const argv = process.argv.slice(2);
  const sep = argv.indexOf("--");
  const ours = sep === -1 ? argv : argv.slice(0, sep);
  const claudeArgs = sep === -1 ? [] : argv.slice(sep + 1);
  const has = (...f) => f.some((x) => ours.includes(x));

  if (has("-h", "--help")) { printHelp(); process.exit(0); }
  if (has("-v", "--version")) { console.log("claude-free v" + VERSION); process.exit(0); }
  if (has("--models")) { printModels(); process.exit(0); }
  if (has("--stop")) { stopProxy(); process.exit(0); }
  if (has("-u", "--update")) { await selfUpdate(); process.exit(0); }

  // Unknown pre-"--" args are still forwarded to claude (back-compat).
  const KNOWN = new Set(["-h", "--help", "-v", "--version", "-u", "--update", "--models", "--stop"]);
  const passthru = [...ours.filter((a) => !KNOWN.has(a)), ...claudeArgs];

  printLogo();
  const runPort = await runningProxyPort();
  const status = runPort ? ("\x1b[32m● proxy on :" + runPort + "\x1b[0m") : "\x1b[90m○ proxy off\x1b[0m";
  console.log("   \x1b[2mv" + VERSION + "\x1b[0m  \x1b[2m·\x1b[0m  " + status +
    "  \x1b[2m·  " + MODELS.length + " models  ·  small: deepseek-v4-flash\x1b[0m\n");

  const mi = await menuRich("Pick a model", modelMenuEntries());
  if (mi < 0) { console.log("cancelled"); process.exit(0); }
  const sel = MODELS[mi];
  const modelId = sel.id, keyService = sel.key;

  const ri = await menu(`Reasoning mode for ${sel.name}?`, ["Without thinking  - fast, direct (recommended)", "With thinking     - deeper, slower"]);
  if (ri < 0) { console.log("cancelled"); process.exit(0); }

  const pi = await menu("Permission mode?", ["Normal             - ask before edits/commands (safe)", "Bypass permissions - run everything, no prompts (risky)"]);
  if (pi < 0) { console.log("cancelled"); process.exit(0); }

  const model = modelId + (ri === 1 ? ":think" : "");
  let authToken = "local-zen";
  if (keyService === "sub") {
    // Subscription models authenticate with your logged-in ZenMux web-session cookie, which the proxy
    // reads from keys.json (zenmux_cookie) or $ZENMUX_COOKIE. The launch auth token stays a placeholder.
    let cookie = process.env.ZENMUX_COOKIE || loadKeys().zenmux_cookie || "";
    if (!cookie) {
      console.log("\nThis model uses your ZenMux subscription via your browser session.");
      console.log("In a logged-in zenmux.ai tab: DevTools > Network > any chat request > copy the full 'cookie:' header.");
      cookie = await ask("Paste your ZenMux cookie: ");
      if (!cookie) { console.log("no cookie entered, aborting"); process.exit(1); }
      const k = loadKeys(); k.zenmux_cookie = cookie; saveKeys(k);
      console.log("saved to " + KEYS_FILE);
    }
  } else if (keyService) {
    authToken = getKey(keyService);
    if (!authToken) {
      console.log(`\nThis model needs a free ${keyService} API key.`);
      if (keyService === "gemini") console.log("Get one at: https://aistudio.google.com/apikey");
      if (keyService === "openrouter") console.log("Get one at: https://openrouter.ai/keys");
      if (keyService === "zenmux") console.log("Get one at: https://zenmux.ai/settings/keys");
      authToken = await ask(`Paste your ${keyService} key: `);
      if (!authToken) { console.log("no key entered, aborting"); process.exit(1); }
      const k = loadKeys(); k[keyService] = authToken; saveKeys(k);
      console.log("saved to " + KEYS_FILE);
    }
  }

  const port = await ensureProxy();
  if (!port) { console.error("Could not start the proxy; aborting."); process.exit(1); }

  const args = [...passthru];
  if (pi === 1) args.push("--dangerously-skip-permissions");
  // Selections done — wipe the picker (and scrollback) so Claude Code starts on a clean screen.
  process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
  console.log(`> launching ${sel.name}${ri === 1 ? " · thinking" : ""}${pi === 1 ? " · bypass" : ""}\n`);

  const env = { ...process.env,
    ANTHROPIC_BASE_URL: "http://127.0.0.1:" + port,
    ANTHROPIC_AUTH_TOKEN: authToken,
    ANTHROPIC_MODEL: model,
    ANTHROPIC_SMALL_FAST_MODEL: SMALL_MODEL,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  };
  // Fully release stdin before handing it to claude. The picker left Node's readline reading
  // keystrokes; if we don't detach, Node and claude both read the same TTY and typed characters
  // get split between them — they look "lost" while typing in Claude Code.
  if (process.stdin.isTTY) { try { process.stdin.setRawMode(false); } catch {} }
  process.stdin.removeAllListeners("keypress");
  process.stdin.removeAllListeners("data");
  process.stdin.pause();

  const isWin = process.platform === "win32";
  const child = spawn("claude", args, { stdio: "inherit", env, shell: isWin });
  child.on("error", (e) => {
    console.error("Could not launch claude:", e.message);
    console.error("Install Claude Code:  npm install -g @anthropic-ai/claude-code");
    process.exit(1);
  });
  child.on("exit", (code) => process.exit(code || 0));
}
if (require.main === module) main();
else module.exports = { MODELS, TIER_LABEL, fmtRow, modelMenuEntries, ensureProxy, proxyFileHash, runningProxyPort };
