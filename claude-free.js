#!/usr/bin/env node
// claude-free — cross-platform picker/launcher for free AI models via a HOSTED proxy.
// Works on Windows (cmd/PowerShell), macOS, and Linux. Arrow keys to pick a model, reasoning
// mode, and permission mode, then it launches Claude Code pointed at your deployed proxy server.
//
// Remote-only: the proxy runs on a server (see Dockerfile) and holds all backend keys. This client
// stores nothing but your API secret key; it never spawns a local proxy.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const readline = require("readline");

const VERSION = "2.2.0";
const DIR = __dirname;
const KEYS_FILE = path.join(DIR, "keys.json");
// Background/small-fast model for Claude Code's housekeeping calls (titles, summaries). Must be one
// the server still serves — pinned to the no-key MiMo backend so it never burns Claude quota.
const SMALL_MODEL = "mimo-auto";
// Where --update pulls the latest client from (override with CLAUDE_FREE_BASE).
const UPDATE_BASE = process.env.CLAUDE_FREE_BASE || "https://raw.githubusercontent.com/haonguyenstech/claude-free/main";

// The hosted claude-free proxy. Baked in so users don't have to set anything; override per-machine
// with CLAUDE_FREE_SERVER (or keys.json {"server": "..."}). Point this at your public domain once deployed.
const DEFAULT_SERVER = "http://127.0.0.1:3000";

// Model catalog. tier groups the picker; tps is from the local benchmark (tokens/sec, single-sample,
// rough), ctx is the context window, star marks the recommended pick in each tier. Ordered by tps.
// { name, id, tier, ctx, tps, note, star }
const MODELS = [
  // --- FREE · no key needed --- (Zen via opencode.ai + Xiaomi MiMo; ordered by tok/s)
  { name: "North Mini Code",   id: "north-mini-code-free",  tier: "free", ctx: "",   tps: 123, note: "fast coding model",        star: true },
  { name: "MiMo Auto",         id: "mimo-auto",             tier: "free", ctx: "1M", tps: 71,  note: "free, no key" },
  { name: "DeepSeek V4 Flash", id: "deepseek-v4-flash-free",tier: "free", ctx: "",   tps: 63,  note: "fast, clean · small model" },
  { name: "Big Pickle",        id: "big-pickle",            tier: "free", ctx: "",   tps: 53,  note: "stealth, fast & clean" },
  { name: "MiMo V2.5",         id: "mimo-v2.5-free",        tier: "free", ctx: "",   tps: 42,  note: "reasoning (shows thinking)" },
  { name: "Nemotron 3 Ultra",  id: "nemotron-3-ultra-free", tier: "free", ctx: "",   tps: 17,  note: "550B, deepest · slow" },
  // --- BYO-key models (key lives on the server) ---
  { name: "MiniMax M3",        id: "tokenrouter/minimax-m3", tier: "paid", ctx: "512K", tps: 28, note: "TokenRouter" },
  // --- Gemini (Google AI Studio · server-side gemini key) ---
  { name: "Gemini 2.5 Flash-Lite", id: "gemini-2.5-flash-lite", tier: "gemini", ctx: "1M", tps: 107, note: "Google · fastest",       star: true },

  { name: "gpt-oss 120B",      id: "openai/gpt-oss-120b:free",                 tier: "openrouter", ctx: "131K", tps: 31, note: "OpenAI open · reliable", star: true },
  { name: "Nemotron 3 Super",  id: "nvidia/nemotron-3-super-120b-a12b:free",   tier: "openrouter", ctx: "1M",   tps: 32, note: "NVIDIA · huge context" },
  { name: "Gemma 4 31B",       id: "google/gemma-4-31b-it:free",               tier: "openrouter", ctx: "262K", tps: 40, note: "Google · clean output" },
  { name: "gpt-oss 20B",       id: "openai/gpt-oss-20b:free",                  tier: "openrouter", ctx: "131K", tps: 33, note: "OpenAI open · lightweight" },
  { name: "Nemotron Nano 12B", id: "nvidia/nemotron-nano-12b-v2-vl:free",      tier: "openrouter", ctx: "128K", tps: 43, note: "fastest · most reliable" },
  // --- Anthropic (Claude models) ---
  { name: "Claude Sonnet 4.6",   id: "cli/claude-sonnet-4-6",     tier: "cli", ctx: "200K", tps: 32, note: "balanced speed + capability", star: true },
  { name: "Claude Opus 4.8",     id: "cli/claude-opus-4-8",       tier: "cli", ctx: "200K", tps: 35, note: "most capable" },
  { name: "Claude Haiku 4.5",    id: "cli/claude-haiku-4-5-20251001", tier: "cli", ctx: "200K", tps: 50, note: "fastest · lightweight" },
];

const TIER_LABEL = {
  free:  "  \x1b[1;38;5;208mFREE\x1b[0m \x1b[2m· no key needed\x1b[0m",
  paid:  "  \x1b[1;38;5;39mTOKENROUTER\x1b[0m \x1b[2m· server API key\x1b[0m",
  gemini:"  \x1b[1;38;5;39mGEMINI\x1b[0m \x1b[2m· Google AI Studio key\x1b[0m",
  openrouter:"  \x1b[1;38;5;39mOPENROUTER\x1b[0m \x1b[2m· free models · needs server OpenRouter key\x1b[0m",
  cli:  "  \x1b[1;38;5;39mANTHROPIC\x1b[0m \x1b[2m· Claude models\x1b[0m",
};
// Hide whole tiers from the picker/--models (models still launch by id). Empty = show all.
const HIDE_TIERS = new Set();
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
// The "change server" row pinned to the top of the model picker. Shows the active server URL.
function fmtServerRow(url, sel) {
  if (sel) return `\x1b[7m ❯  server: ${url}  · enter to change \x1b[0m`;
  return `    \x1b[90mserver:\x1b[0m \x1b[36m${url}\x1b[0m  \x1b[90m· enter to change\x1b[0m`;
}
// The "set API key" row pinned under the server row. Shows the masked key (or "not set").
function fmtApiKeyRow(sel) {
  const t = getToken();
  const verb = t ? "change" : "set";
  if (sel) return `\x1b[7m ❯  API key: ${maskKey(t)}  · enter to ${verb} \x1b[0m`;
  const col = t ? 36 : 33;
  return `    \x1b[90mAPI key:\x1b[0m \x1b[${col}m${maskKey(t)}\x1b[0m  \x1b[90m· enter to ${verb}\x1b[0m`;
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
function ask(q) {
  return new Promise((r) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); rl.question(q, (a) => { rl.close(); r(a.trim()); }); });
}

// Resolve the current/default server URL: env > keys.json > baked default. Trailing slashes trimmed.
function serverUrl() {
  return (process.env.CLAUDE_FREE_SERVER || loadKeys().server || DEFAULT_SERVER || "").replace(/\/+$/, "");
}
// Resolve the API key: env > keys.json. Prompted + saved on first run if missing.
// CLAUDE_FREE_TOKEN is the legacy env name, still honored for back-compat.
function getToken() {
  return process.env.CLAUDE_FREE_API_KEY || process.env.CLAUDE_FREE_TOKEN || loadKeys().token || "";
}
// Mask an API key for display: "····1234", or "not set" when empty.
function maskKey(t) {
  return t ? "····" + t.slice(-4) : "not set";
}
// Prompt the user to paste the API secret key and persist it to keys.json.
// Returns the new (or unchanged) key. Used by both --set-key and the picker row.
async function setApiKey() {
  const cur = getToken();
  if (cur) console.log("Current API key: " + maskKey(cur));
  console.log("Paste the API secret key from the proxy operator (Dashboard → API Keys).");
  const v = await ask("API key: ");
  if (!v) { console.log("no key entered — keeping the current one"); return cur; }
  const k = loadKeys(); k.token = v; saveKeys(k);
  console.log("saved to " + KEYS_FILE);
  return v;
}
// Normalize a typed URL: add a scheme if missing (http for localhost, https otherwise), trim slashes.
function normalizeUrl(u) {
  u = (u || "").trim();
  if (!u) return "";
  if (!/^https?:\/\//i.test(u)) {
    const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(u);
    u = (local ? "http://" : "https://") + u;
  }
  return u.replace(/\/+$/, "");
}
// Known servers for the picker: saved list (keys.json "servers") + current default, deduped, current first.
function serverList() {
  const cur = serverUrl();
  const saved = (loadKeys().servers || []).map((s) => (s || "").replace(/\/+$/, "")).filter(Boolean);
  const out = [];
  for (const u of [cur, ...saved]) if (u && !out.includes(u)) out.push(u);
  return out;
}
// Persist a chosen server as the new default and add it to the saved list.
function rememberServer(url) {
  const k = loadKeys();
  k.server = url;
  const set = (k.servers || []).map((s) => (s || "").replace(/\/+$/, "")).filter(Boolean);
  if (!set.includes(url)) set.push(url);
  k.servers = set;
  saveKeys(k);
}
// Let the user select a saved server or type a new one, with an explicit connection test on each.
// Returns the chosen URL (and remembers it), or null if cancelled.
async function chooseServer() {
  while (true) {
    const known = serverList();
    const items = [...known, "Custom… (enter a server URL)"];
    const idx = await menu("Select server", items);
    if (idx < 0) return null;
    let url;
    if (idx === known.length) {
      url = normalizeUrl(await ask("Server URL (e.g. https://proxy.example.com): "));
      if (!url) continue;
    } else {
      url = known[idx];
    }
    // Per-URL action loop: test, then use / re-test / go back.
    while (true) {
      process.stdout.write("  testing " + url + " … ");
      const ok = await serverOnline(url);
      console.log(ok ? "\x1b[32m● online\x1b[0m" : "\x1b[33m○ unreachable\x1b[0m");
      const a = await menu(url, [
        ok ? "Use this server" : "Use anyway (offline)",
        "Test connection again",
        "← Back to server list",
      ]);
      if (a < 0) return null;
      if (a === 0) { rememberServer(url); return url; }
      if (a === 1) continue;      // re-test the same URL
      break;                       // back to the server list
    }
  }
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
function menuRich(title, entries, startPos = 0) {
  const pick = entries.map((e, i) => (e.header === undefined ? i : -1)).filter((i) => i >= 0);
  return new Promise((resolve) => {
    let pos = Math.min(Math.max(startPos, 0), pick.length - 1);
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

// Confirm the hosted proxy is reachable. Hits GET /health (works for http and https URLs).
function serverOnline(url) {
  return new Promise((resolve) => {
    let u; try { u = new URL(url); } catch { return resolve(false); }
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request({
      host: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: "/health", method: "GET", timeout: 5000,
    }, (res) => { res.resume(); resolve(res.statusCode >= 200 && res.statusCode < 500); });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
    req.end();
  });
}

// Validate the API key against the server before launching Claude Code, so a bad/expired key fails
// here with a clear message instead of as an opaque 401 deep inside Claude Code. Uses the cheap
// count_tokens endpoint (auth-gated, no upstream model call). Resolves the HTTP status, or 0 on a
// network error (non-fatal — only a definitive 401 blocks the launch).
function preflightKey(server, token) {
  return new Promise((resolve) => {
    let u; try { u = new URL(server); } catch { return resolve(0); }
    const lib = u.protocol === "https:" ? https : http;
    const payload = Buffer.from(JSON.stringify({ messages: [{ role: "user", content: "ping" }] }), "utf8");
    const req = lib.request({
      host: u.hostname, port: u.port || (u.protocol === "https:" ? 443 : 80),
      path: "/v1/messages/count_tokens", method: "POST", timeout: 5000,
      headers: { "content-type": "application/json", "content-length": payload.length, authorization: "Bearer " + token },
    }, (res) => { res.resume(); resolve(res.statusCode || 0); });
    req.on("error", () => resolve(0));
    req.on("timeout", () => { req.destroy(); resolve(0); });
    req.write(payload);
    req.end();
  });
}

// ---- CLI flags ----
function printHelp() {
  console.log(`claude-free v${VERSION}  -  run Claude Code on free AI models (hosted proxy)

Usage:
  claude-free [options] [-- <claude args...>]

Options:
  -h, --help       show this help and exit
  -v, --version    print the version and exit
  -u, --update     update claude-free to the latest version from GitHub
      --models     list the available models and exit
      --set-key    set/replace your API secret key (paste it), then exit

Run with no options to pick a model interactively, then launch Claude Code against the
hosted proxy. Anything after "--" is passed straight through to 'claude', e.g.
  claude-free -- --resume

Environment:
  CLAUDE_FREE_SERVER   the hosted proxy URL (default: baked-in DEFAULT_SERVER)
  CLAUDE_FREE_API_KEY  your API secret key for the server (else prompted once, saved to keys.json;
                       CLAUDE_FREE_TOKEN is the legacy alias and still works)
  CLAUDE_FREE_BASE     source for --update (default: this repo's GitHub raw)`);
}

function printModels() {
  console.log(`claude-free v${VERSION}  -  available models:\n`);
  for (const m of MODELS) {
    if (HIDE_TIERS.has(m.tier)) continue;
    const tag = m.tier === "free" ? "(no key)"
      : m.tier === "paid" ? "(server key)"
      : m.tier === "gemini" ? "(gemini key)"
      : m.tier === "openrouter" ? "(openrouter key)"
      : m.tier === "cli" ? "(anthropic)"
      : "(subscription)";
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

// Compare dotted versions. Returns -1 if a<b, 0 if equal, 1 if a>b.
function cmpVersion(a, b) {
  const pa = String(a).split(".").map((n) => Number(n) || 0);
  const pb = String(b).split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
}

async function selfUpdate() {
  console.log(`Updating claude-free (v${VERSION}) from ${UPDATE_BASE} ...`);
  process.stdout.write("  claude-free.js ... ");
  let body;
  try {
    body = await download(UPDATE_BASE + "/claude-free.js");
  } catch (e) {
    console.error("FAILED: " + e.message);
    console.error("Update aborted; your existing file is unchanged.");
    process.exit(1);
  }
  if (!body || body.length < 200) {
    console.error("FAILED: download too small — aborting; your existing file is unchanged.");
    process.exit(1);
  }
  // Refuse anything that isn't the hosted client. Guards against an older local-proxy build still
  // sitting on the update branch silently DOWNGRADING a working install (it lacks these markers).
  if (!/CLAUDE_FREE_SERVER|DEFAULT_SERVER/.test(body)) {
    console.error("FAILED: the downloaded file isn't the hosted claude-free client — refusing to install it.");
    console.error("Your existing file is unchanged.");
    process.exit(1);
  }
  // Refuse to overwrite a newer install with an older/equal one.
  const rv = body.match(/const VERSION = "([\d.]+)"/);
  const remoteVer = rv ? rv[1] : null;
  if (remoteVer && cmpVersion(remoteVer, VERSION) <= 0) {
    console.log(`\nAlready up to date (local v${VERSION}, remote v${remoteVer}) — nothing to install.`);
    process.exit(0);
  }
  try {
    fs.writeFileSync(path.join(DIR, "claude-free.js"), body);
  } catch (e) {
    console.error("FAILED: " + e.message);
    console.error("Update aborted; your existing file is unchanged.");
    process.exit(1);
  }
  console.log("ok (" + body.length + " bytes)" + (remoteVer ? " → v" + remoteVer : ""));
  console.log("\nUpdated. Just run claude-free again.");
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
  if (has("-u", "--update")) { await selfUpdate(); process.exit(0); }
  if (has("--set-key", "--set-api-key")) { await setApiKey(); process.exit(0); }

  // Unknown pre-"--" args are still forwarded to claude (back-compat).
  const KNOWN = new Set(["-h", "--help", "-v", "--version", "-u", "--update", "--models", "--set-key", "--set-api-key"]);
  const passthru = [...ours.filter((a) => !KNOWN.has(a)), ...claudeArgs];

  printLogo();
  console.log("   \x1b[2mv" + VERSION + "\x1b[0m\n");

  // Server is picked once (first run) and remembered. CLAUDE_FREE_SERVER always wins if set.
  let server = process.env.CLAUDE_FREE_SERVER ? normalizeUrl(process.env.CLAUDE_FREE_SERVER) : (loadKeys().server || "");
  if (!server) {
    server = await chooseServer();
    if (!server) { console.log("cancelled"); process.exit(0); }
  }

  // Model picker with a pinned "change server" row on top; default selection is the first model.
  let sel;
  while (true) {
    const entries = [
      { value: "__server__", render: (s) => fmtServerRow(server, s) },
      { value: "__apikey__", render: (s) => fmtApiKeyRow(s) },
      ...modelMenuEntries(),
    ];
    const mi = await menuRich("Pick a model", entries, 2);
    if (mi === -1) { console.log("cancelled"); process.exit(0); }
    if (mi === "__server__") {
      const ns = await chooseServer();
      if (ns) server = ns;
      continue;
    }
    if (mi === "__apikey__") {
      await setApiKey();
      continue;
    }
    sel = MODELS[mi];
    break;
  }

  const ri = await menu(`Reasoning mode for ${sel.name}?`, ["Without thinking  - fast, direct (recommended)", "With thinking     - deeper, slower"]);
  if (ri < 0) { console.log("cancelled"); process.exit(0); }

  const pi = await menu("Permission mode?", ["Normal             - ask before edits/commands (safe)", "Bypass permissions - run everything, no prompts (risky)"]);
  if (pi < 0) { console.log("cancelled"); process.exit(0); }

  const model = sel.id + (ri === 1 ? ":think" : "");

  // The API key is this client's only secret — it authenticates to the server, which holds
  // all the real backend keys. Prompted once, then cached in keys.json (or set via the picker row
  // / --set-key at any time).
  let token = getToken();
  if (!token) {
    console.log("\nThis launcher connects to a hosted proxy that requires an API secret key.");
    console.log("Ask the server operator for your key.");
    token = await setApiKey();
    if (!token) { console.log("no API key entered, aborting"); process.exit(1); }
  }

  // Preflight the key so an invalid/expired one fails here with a clear message, not as an opaque
  // 401 inside Claude Code. Only a definitive 401 blocks; network hiccups (0) fall through.
  let pf = await preflightKey(server, token);
  if (pf === 401) {
    console.log("\n\x1b[33mThe server rejected your API key — it's invalid or expired.\x1b[0m");
    token = await setApiKey();
    if (token) pf = await preflightKey(server, token);
    if (!token || pf === 401) {
      console.log("Still rejected — aborting. Ask the operator for a fresh key, then run: claude-free --set-key");
      process.exit(1);
    }
  }

  const args = [...passthru];
  if (pi === 1) args.push("--dangerously-skip-permissions");
  // Selections done — wipe the picker (and scrollback) so Claude Code starts on a clean screen.
  process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
  console.log(`> launching ${sel.name}${ri === 1 ? " · thinking" : ""}${pi === 1 ? " · bypass" : ""}\n`);

  const env = { ...process.env,
    ANTHROPIC_BASE_URL: server,
    ANTHROPIC_AUTH_TOKEN: token,
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
else module.exports = { MODELS, TIER_LABEL, fmtRow, modelMenuEntries, serverUrl, getToken, serverOnline };
