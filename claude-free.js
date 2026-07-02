#!/usr/bin/env node
// claude-free — cross-platform picker/launcher for free AI models via a HOSTED proxy.
// Works on Windows (cmd/PowerShell), macOS, and Linux. Arrow keys to pick a model, reasoning
// mode, and permission mode, then it launches Claude Code pointed at your deployed proxy server.
//
// Remote-only: the proxy runs on a server (see Dockerfile) and holds all backend keys. This client
// stores nothing but your access token; it never spawns a local proxy.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const readline = require("readline");

const VERSION = "2.6.2";
const DIR = __dirname;
const KEYS_FILE = path.join(DIR, "keys.json");
// Background/small-fast model for Claude Code's housekeeping calls (titles, summaries). Must be one
// the server still serves — pinned to the fastest OpenCode model so it never burns Claude quota.
const SMALL_MODEL = "north-mini-code-free";
// Where --update pulls the latest client from (override with CLAUDE_FREE_BASE).
const UPDATE_BASE = process.env.CLAUDE_FREE_BASE || "https://raw.githubusercontent.com/haonguyenstech/claude-free/main";

// The hosted claude-free proxy. Baked in so users don't have to set anything; override per-machine
// with CLAUDE_FREE_SERVER (or keys.json {"server": "..."}). Point this at your public domain once deployed.
const DEFAULT_SERVER = "http://127.0.0.1:3000";

// Model catalog. tier groups the picker; tps is kept for internal ordering only, ctx is the context
// window, star marks the recommended pick.
// { name, id, tier, ctx, tps, note, star }
const MODELS = [
  // --- OpenCode · ready to use --- (Zen via opencode.ai)
  { name: "North Mini Code",   id: "north-mini-code-free",   tier: "opencode", ctx: "",   tps: 123, note: "fast coding model",         star: true },
  { name: "DeepSeek V4 Flash", id: "deepseek-v4-flash-free", tier: "opencode", ctx: "",   tps: 63,  note: "fast, clean · small model" },
  { name: "Big Pickle",        id: "big-pickle",             tier: "opencode", ctx: "",   tps: 53,  note: "stealth, fast & clean" },
  { name: "MiMo V2.5",         id: "mimo-v2.5-free",         tier: "opencode", ctx: "",   tps: 42,  note: "reasoning (shows thinking)" },
  { name: "Nemotron 3 Ultra",  id: "nemotron-3-ultra-free",  tier: "opencode", ctx: "",   tps: 17,  note: "550B, deepest · slow" },
  // --- ClinePass · extra models when enabled --- (api.cline.bot)
  { name: "GLM-5.2",           id: "cline-pass/glm-5.2",          tier: "clinepass", ctx: "",   tps: 0, note: "general coding" },
  { name: "Kimi K2.7 Code",    id: "cline-pass/kimi-k2.7-code",   tier: "clinepass", ctx: "1M", tps: 0, note: "large context" },
  { name: "Kimi K2.6",         id: "cline-pass/kimi-k2.6",        tier: "clinepass", ctx: "1M", tps: 0, note: "large context" },
  { name: "DeepSeek V4 Pro",   id: "cline-pass/deepseek-v4-pro",  tier: "clinepass", ctx: "",   tps: 0, note: "deep reasoning" },
  { name: "DeepSeek V4 Flash", id: "cline-pass/deepseek-v4-flash",tier: "clinepass", ctx: "",   tps: 0, note: "fast" },
  { name: "MiMo-V2.5",         id: "cline-pass/mimo-v2.5",        tier: "clinepass", ctx: "",   tps: 0, note: "reasoning" },
  { name: "MiMo-V2.5-Pro",     id: "cline-pass/mimo-v2.5-pro",    tier: "clinepass", ctx: "",   tps: 0, note: "reasoning · pro" },
  { name: "MiniMax M3",        id: "cline-pass/minimax-m3",       tier: "clinepass", ctx: "",   tps: 0, note: "general" },
  { name: "Qwen3.7 Max",       id: "cline-pass/qwen3.7-max",      tier: "clinepass", ctx: "",   tps: 0, note: "largest Qwen" },
  { name: "Qwen3.7 Plus",      id: "cline-pass/qwen3.7-plus",     tier: "clinepass", ctx: "",   tps: 0, note: "balanced Qwen" },
];

const TIER_LABEL = {
  opencode:  "\x1b[38;5;244m╭─ Models /\x1b[0m \x1b[1;38;5;208mOpenCode\x1b[0m \x1b[2mready to use\x1b[0m",
  clinepass: "\x1b[38;5;244m╭─ Models /\x1b[0m \x1b[1;38;5;39mClinePass\x1b[0m \x1b[2mextra models when enabled\x1b[0m",
};
// Hide whole tiers from the picker/--models (models still launch by id). Empty = show all.
const HIDE_TIERS = new Set();
const UI = {
  r: "\x1b[0m",
  dim: "\x1b[2m",
  muted: "\x1b[90m",
  cyan: "\x1b[36m",
  gold: "\x1b[1;38;5;220m",
  text: "\x1b[1;38;5;255m",
  selected: "\x1b[48;5;238m",
}
const SETUP_LABEL = "\x1b[38;5;244m╭─ Setup\x1b[0m \x1b[2mserver and access token\x1b[0m";
// One model row. Selected rows use a soft terminal background instead of raw reverse video.
function fmtRow(m, sel) {
  const mark = m.star ? "★" : " ";
  const name = m.name.padEnd(24);
  const ctxPlain = m.ctx ? `${m.ctx.padStart(3)} ctx` : "       ";
  const ctx = m.ctx ? `${UI.cyan}${ctxPlain}${UI.r}` : "       ";
  const note = `${UI.muted}${m.note}${UI.r}`;
  if (sel) return `${UI.selected}${UI.cyan}▶${UI.r}${UI.selected} ${mark} ${name} ${ctxPlain}  ${m.note} ${UI.r}`;
  const star = m.star ? UI.gold + mark + UI.r : " ";
  return `${UI.muted}│${UI.r}   ${star} ${UI.text}${name}${UI.r} ${ctx}  ${note}`;
}
// The "change server" row pinned to the top of the model picker. Shows the active server URL.
function fmtServerRow(url, sel) {
  if (sel) return `${UI.selected}${UI.cyan}▶${UI.r}${UI.selected} Server   ${url}  · enter to change ${UI.r}`;
  return `${UI.muted}│${UI.r}   ${UI.text}Server${UI.r}   ${UI.cyan}${url}${UI.r}  ${UI.muted}· enter to change${UI.r}`;
}
// The "set access token" row pinned under the server row. Shows the masked token (or "not set").
function fmtApiKeyRow(sel) {
  const t = getToken();
  const verb = t ? "change" : "set";
  if (sel) return `${UI.selected}${UI.cyan}▶${UI.r}${UI.selected} Token    ${maskKey(t)}  · enter to ${verb} ${UI.r}`;
  const col = t ? 36 : 33;
  return `${UI.muted}│${UI.r}   ${UI.text}Token${UI.r}    \x1b[${col}m${maskKey(t)}${UI.r}  ${UI.muted}· enter to ${verb}${UI.r}`;
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
function getOptions() {
  const k = loadKeys();
  return {
    thinking: !!k.thinking,
    bypass: !!k.bypassPermissions,
  };
}
function saveOptions(opts) {
  const k = loadKeys();
  k.thinking = !!opts.thinking;
  k.bypassPermissions = !!opts.bypass;
  saveKeys(k);
}
function getLastModelId() {
  return loadKeys().lastModel || "";
}
function saveLastModelId(id) {
  const k = loadKeys();
  k.lastModel = id;
  saveKeys(k);
}
function fmtCheckbox(label, checked, hint, sel) {
  const box = checked ? "[x]" : "[ ]";
  if (sel) return `${UI.selected}${UI.cyan}▶${UI.r}${UI.selected} ${box} ${label.padEnd(10)} ${hint} ${UI.r}`;
  return `${UI.muted}│${UI.r}   ${checked ? UI.cyan : UI.muted}${box}${UI.r} ${UI.text}${label.padEnd(10)}${UI.r} ${UI.muted}${hint}${UI.r}`;
}
// Read a line of input (URL, access token, …). We deliberately reuse the SAME raw-mode keypress mechanism
// the arrow-key menus use, instead of readline.createInterface — interleaving a readline line-reader
// with the menus' emitKeypressEvents decoder on the same stdin garbled/swallowed typed input (the
// "can't type the server URL" bug). Handles typing, paste (chunks arrive as printable str), backspace,
// Enter, and Ctrl-C, echoing as you go.
function ask(q) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(q);
    readline.emitKeypressEvents(stdin);
    if (stdin.isTTY) { try { stdin.setRawMode(true); } catch {} }
    stdin.resume();
    let buf = "";
    const onKey = (str, key) => {
      const name = key && key.name;
      if (name === "return" || name === "enter") {
        stdin.removeListener("keypress", onKey);
        if (stdin.isTTY) { try { stdin.setRawMode(false); } catch {} }
        process.stdout.write("\n");
        resolve(buf.trim());
      } else if (name === "backspace") {
        if (buf.length) { buf = buf.slice(0, -1); process.stdout.write("\b \b"); }
      } else if (key && key.ctrl && name === "c") {
        if (stdin.isTTY) { try { stdin.setRawMode(false); } catch {} }
        process.stdout.write("\n");
        process.exit(0);
      } else if (str && str.charCodeAt(0) >= 0x20) {
        // Printable input — single char or a pasted chunk; ignores escape/control sequences.
        buf += str;
        process.stdout.write(str);
      }
    };
    stdin.on("keypress", onKey);
  });
}

// Resolve the current/default server URL: env > keys.json > baked default. Trailing slashes trimmed.
function serverUrl() {
  return (process.env.CLAUDE_FREE_SERVER || loadKeys().server || DEFAULT_SERVER || "").replace(/\/+$/, "");
}
// Resolve the access token: env > keys.json. Prompted + saved on first run if missing.
// CLAUDE_FREE_TOKEN is the legacy env name, still honored for back-compat.
function getToken() {
  return process.env.CLAUDE_FREE_API_KEY || process.env.CLAUDE_FREE_TOKEN || loadKeys().token || "";
}
// Mask an access token for display: "····1234", or "not set" when empty.
function maskKey(t) {
  return t ? "····" + t.slice(-4) : "not set";
}
// Prompt the user to paste the access token and persist it to keys.json.
// Returns the new (or unchanged) token. Used by both --set-key and the picker row.
async function setApiKey() {
  const cur = getToken();
  if (cur) console.log("Current token: " + maskKey(cur));
  console.log("Paste your claude-free access token.");
  const v = await ask("Access token: ");
  if (!v) { console.log("no token entered — keeping the current one"); return cur; }
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
      const lines = [`\x1b[1;38;5;255m${title}\x1b[0m  \x1b[2m↑/↓ navigate · enter select · q quit\x1b[0m`];
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
      else if (key.name === "return") {
        const entry = entries[pick[pos]];
        if (typeof entry.action === "function") {
          entry.action();
          render(false);
          return;
        }
        return done(entry.value);
      }
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

// Validate the access token against the server before launching Claude Code, so a bad/expired token fails
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
  console.log(`claude-free v${VERSION}  -  run Claude Code with ready-to-use models

Usage:
  claude-free [options] [-- <claude args...>]

Options:
  -h, --help       show this help and exit
  -v, --version    print the version and exit
  -u, --update     update claude-free to the latest version from GitHub
      --models     list the available models and exit
      --set-key    set/replace your access token, then exit
      --set-server <url>  point the client at a proxy URL and save it, then exit

Run with no options to pick a model interactively, then launch Claude Code against the
configured server. Anything after "--" is passed straight through to 'claude', e.g.
  claude-free -- --resume

Environment:
  CLAUDE_FREE_SERVER   server URL (default: baked-in DEFAULT_SERVER)
  CLAUDE_FREE_API_KEY  your access token (else prompted once, saved to keys.json;
                       CLAUDE_FREE_TOKEN is the legacy alias and still works)
  CLAUDE_FREE_BASE     source for --update (default: this repo's GitHub raw)`);
}

function printModels() {
  console.log(`claude-free v${VERSION}  -  available models:\n`);
  for (const m of MODELS) {
    if (HIDE_TIERS.has(m.tier)) continue;
    const tag = m.tier === "opencode" ? "OpenCode" : "ClinePass";
    console.log(`  ${m.id.padEnd(40)} ${tag}\n    ${m.name} — ${m.note}${m.ctx ? " · " + m.ctx + " ctx" : ""}`);
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

// Terminal version of the app logo: dark tile + open C mark with the same color flow.
function printLogo() {
  const r = "\x1b[0m";
  const border = "\x1b[38;5;244m";
  const blue = "\x1b[1;38;5;39m";
  const green = "\x1b[1;38;5;34m";
  const yellow = "\x1b[1;38;5;220m";
  const red = "\x1b[1;38;5;196m";
  const white = "\x1b[1;38;5;255m";
  const dim = "\x1b[2m";
  const width = 42;
  const line = (plain, styled) => {
    const pad = " ".repeat(Math.max(0, width - 1 - plain.length));
    console.log(`${border}│${r} ${styled}${pad}${border}│${r}`);
  };

  console.log(`${border}╭${"─".repeat(width)}╮${r}`);
  line("╭━━━━   CLAUDE-FREE", `${blue}╭━━━━${r}   ${white}CLAUDE${blue}-FREE${r}`);
  line("┃      Claude Code model picker", `${green}┃${r}      ${dim}Claude Code model picker${r}`);
  line("┃      install · pick · run", `${yellow}┃${r}      ${dim}install · pick · run${r}`);
  line("╰━━━━   free models from your CLI", `${red}╰━━━━${r}   ${dim}free models from your CLI${r}`);
  console.log(`${border}╰${"─".repeat(width)}╯${r}`);
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
  // Non-interactive way to point the client at a different proxy (no picker/typing needed).
  if (has("--set-server")) {
    const i = ours.indexOf("--set-server");
    const url = normalizeUrl(ours[i + 1] || "");
    if (!url) { console.log("usage: claude-free --set-server <url>"); process.exit(1); }
    rememberServer(url);
    console.log("server set to " + url + " (saved to " + KEYS_FILE + ")");
    process.exit(0);
  }

  // Unknown pre-"--" args are still forwarded to claude (back-compat).
  const KNOWN = new Set(["-h", "--help", "-v", "--version", "-u", "--update", "--models", "--set-key", "--set-api-key", "--set-server"]);
  const passthru = [...ours.filter((a) => !KNOWN.has(a)), ...claudeArgs];

  printLogo();
  console.log("   \x1b[2mv" + VERSION + "\x1b[0m\n");

  // Server is picked once (first run) and remembered. CLAUDE_FREE_SERVER always wins if set.
  let server = process.env.CLAUDE_FREE_SERVER ? normalizeUrl(process.env.CLAUDE_FREE_SERVER) : (loadKeys().server || "");
  if (!server) {
    server = await chooseServer();
    if (!server) { console.log("cancelled"); process.exit(0); }
  }

  // Model picker with setup rows on top; option rows are toggles and are remembered.
  let sel;
  let options = getOptions();
  const lastModel = getLastModelId();
  while (true) {
    const entries = [
      { header: SETUP_LABEL },
      { value: "__server__", render: (s) => fmtServerRow(server, s) },
      { value: "__apikey__", render: (s) => fmtApiKeyRow(s) },
      {
        value: "__thinking__",
        render: (s) => fmtCheckbox("Thinking", options.thinking, options.thinking ? "deeper, slower" : "fast, direct", s),
        action: () => {
          options.thinking = !options.thinking;
          saveOptions(options);
        },
      },
      {
        value: "__bypass__",
        render: (s) => fmtCheckbox("Bypass", options.bypass, options.bypass ? "no prompts for edits/commands" : "ask before edits/commands", s),
        action: () => {
          options.bypass = !options.bypass;
          saveOptions(options);
        },
      },
      ...modelMenuEntries(),
    ];
    const rememberedModelIndex = lastModel ? MODELS.findIndex((m) => m.id === lastModel) : -1;
    const rememberedEntryIndex = rememberedModelIndex >= 0 ? entries.findIndex((e) => e.value === rememberedModelIndex) : -1;
    const startPos = rememberedEntryIndex >= 0
      ? entries.slice(0, rememberedEntryIndex + 1).filter((e) => e.header === undefined).length - 1
      : 4;
    const mi = await menuRich("Choose model", entries, startPos);
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
    saveLastModelId(sel.id);
    break;
  }

  const model = sel.id + (options.thinking ? ":think" : "");

  // The access token is this client's only secret. Prompted once, then cached in keys.json
  // (or set via the picker row / --set-key at any time).
  let token = getToken();
  if (!token) {
    console.log("\nThis launcher needs an access token before it can start Claude Code.");
    token = await setApiKey();
    if (!token) { console.log("no token entered, aborting"); process.exit(1); }
  }

  // Preflight the key so an invalid/expired one fails here with a clear message, not as an opaque
  // 401 inside Claude Code. Only a definitive 401 blocks; network hiccups (0) fall through.
  let pf = await preflightKey(server, token);
  if (pf === 401) {
    console.log("\n\x1b[33mThe server rejected your token — it's invalid or expired.\x1b[0m");
    token = await setApiKey();
    if (token) pf = await preflightKey(server, token);
    if (!token || pf === 401) {
      console.log("Still rejected — aborting. Request a fresh token, then run: claude-free --set-key");
      process.exit(1);
    }
  }

  const args = [...passthru];
  if (options.bypass) args.push("--dangerously-skip-permissions");
  // Selections done — wipe the picker (and scrollback) so Claude Code starts on a clean screen.
  process.stdout.write("\x1b[2J\x1b[3J\x1b[H");
  console.log(`> ${sel.name}${options.thinking ? " · thinking" : ""}${options.bypass ? " · bypass" : ""}\n`);

  const env = { ...process.env,
    ANTHROPIC_BASE_URL: server,
    ANTHROPIC_AUTH_TOKEN: token,
    // Blank any inherited ANTHROPIC_API_KEY (e.g. a stale HF token from the hf-claude
    // shell function) so it can't compete with AUTH_TOKEN. AUTH_TOKEN wins per Claude
    // Code's precedence, but clearing it removes all ambiguity — and the cmux opt-out
    // below would otherwise preserve a leaked key.
    ANTHROPIC_API_KEY: "",
    ANTHROPIC_MODEL: model,
    ANTHROPIC_SMALL_FAST_MODEL: SMALL_MODEL,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
    // cmux's claude wrapper (cmux-claude-wrapper) intentionally DELETES inherited
    // ANTHROPIC_MODEL / ANTHROPIC_SMALL_FAST_MODEL / ANTHROPIC_API_KEY before exec'ing
    // the real claude, so a parent shell's stale selection can't leak into a cmux session.
    // Inside cmux that strips the model we just picked, and Claude Code falls back to
    // ~/.claude/settings.json (e.g. opus[1m]) — i.e. it shows the official Anthropic model
    // instead of ours. This opt-out tells the wrapper to keep our selection. Harmless
    // outside cmux (the wrapper isn't on PATH there). See CMUX_PRESERVE_CLAUDE_AUTH_SELECTION_ENV.
    CMUX_PRESERVE_CLAUDE_AUTH_SELECTION_ENV: "1",
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
