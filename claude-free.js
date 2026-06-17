#!/usr/bin/env node
// claude-free — cross-platform picker/launcher for free AI models via the local proxy.
// Works on Windows (cmd/PowerShell), macOS, and Linux. Arrow keys to pick a model,
// reasoning mode, and permission mode, then it launches Claude Code pointed at the proxy.
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const readline = require("readline");

const VERSION = "1.2.3";
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

// [menu label, model id, key service or null]
const MODELS = [
  ["⭐ DeepSeek V4 Flash  — fast, clean (recommended default)",                  "deepseek-v4-flash-free", null],
  ["Big Pickle          — stealth model, fast & clean",                         "big-pickle",             null],
  ["North Mini Code     — fast coding model",                                   "north-mini-code-free",   null],
  ["MiMo V2.5           — reasoning model (shows thinking)",                     "mimo-v2.5-free",         null],
  ["Nemotron 3 Ultra    — 550B, deepest but slowest",                           "nemotron-3-ultra-free",  null],
  ["MiMo Auto           — FREE via Xiaomi, MiMo-V2.5 1M ctx (no key)",           "mimo-auto",              null],
  ["Gemini 2.5 Flash    — FREE via Google AI Studio, 1M ctx, reliable (needs key)", "gemini-2.5-flash",   "gemini"],
];

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

function readState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, "utf8")); } catch { return null; } }

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
  if (existing) return existing;
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
  for (const [label, id, key] of MODELS) {
    console.log(`  ${id.padEnd(24)} ${key ? "(needs " + key + " key)" : "(no key)"}\n    ${label.replace(/\s{2,}/g, " ")}`);
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
  console.log("\nUpdated. If the proxy is already running, restart it:  (stop it, then run claude-free)");
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

  const mi = await menu("Pick a free AI model", MODELS.map((m) => m[0]));
  if (mi < 0) { console.log("cancelled"); process.exit(0); }
  const [, modelId, keyService] = MODELS[mi];

  const ri = await menu(`Reasoning mode for ${modelId}?`, ["Without thinking  - fast, direct (recommended)", "With thinking     - deeper, slower"]);
  if (ri < 0) { console.log("cancelled"); process.exit(0); }

  const pi = await menu("Permission mode?", ["Normal             - ask before edits/commands (safe)", "Bypass permissions - run everything, no prompts (risky)"]);
  if (pi < 0) { console.log("cancelled"); process.exit(0); }

  const model = modelId + (ri === 1 ? ":think" : "");
  let authToken = "local-zen";
  if (keyService) {
    authToken = getKey(keyService);
    if (!authToken) {
      console.log(`\nThis model needs a free ${keyService} API key.`);
      if (keyService === "gemini") console.log("Get one at: https://aistudio.google.com/apikey");
      if (keyService === "openrouter") console.log("Get one at: https://openrouter.ai/keys");
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
  console.log(`\n> launching claude on ${model}${pi === 1 ? "  [bypass]" : ""}\n`);

  const env = { ...process.env,
    ANTHROPIC_BASE_URL: "http://127.0.0.1:" + port,
    ANTHROPIC_AUTH_TOKEN: authToken,
    ANTHROPIC_MODEL: model,
    ANTHROPIC_SMALL_FAST_MODEL: SMALL_MODEL,
    CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "1",
  };
  const isWin = process.platform === "win32";
  const child = spawn("claude", args, { stdio: "inherit", env, shell: isWin });
  child.on("error", (e) => {
    console.error("Could not launch claude:", e.message);
    console.error("Install Claude Code:  npm install -g @anthropic-ai/claude-code");
    process.exit(1);
  });
  child.on("exit", (code) => process.exit(code || 0));
}
main();
