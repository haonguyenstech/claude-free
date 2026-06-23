// MiMo free backend (Xiaomi) handshake. Lifted verbatim from claude-proxy.js (lines 76-116).
// Two-step: POST a device fingerprint to /bootstrap -> short-lived JWT -> OpenAI-compatible /chat.
// Reuses the mimocode CLI's fingerprint if present, else generates & caches our own. JWT cached,
// refreshed ~5 min before expiry. Module-level cache kept (per-process), exactly like the original.

import https from "node:https";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
import pathMod from "node:path";
import { MIMO_HOST, MIMO_BOOTSTRAP_PATH } from "./models";
import { DATA_DIR } from "./config";

let _mimoJwt: string | null = null;
let _mimoExp = 0;

function mimoFingerprint(): string {
  // 1) reuse mimocode CLI's fingerprint (mac/linux and Windows locations)
  const cliPaths = [
    pathMod.join(os.homedir(), ".local", "share", "mimocode", "mimo-free-client"),
    pathMod.join(process.env.LOCALAPPDATA || pathMod.join(os.homedir(), "AppData", "Local"), "mimocode", "mimo-free-client"),
  ];
  for (const p of cliPaths) {
    try {
      const v = fs.readFileSync(p, "utf8").trim();
      if (v) return v;
    } catch {}
  }
  // 2) our own cached fingerprint next to the data dir
  const own = pathMod.join(DATA_DIR, "mimo-free-client");
  try {
    const v = fs.readFileSync(own, "utf8").trim();
    if (v) return v;
  } catch {}
  // 3) generate one the same way mimocode does: sha256(host|platform|arch|cpu|user)
  const cpu = (os.cpus()[0] || ({} as os.CpuInfo)).model || "unknown-cpu";
  let user = "unknown-user";
  try {
    user = os.userInfo().username;
  } catch {}
  const seed = [os.hostname(), process.platform, process.arch, cpu, user].join("|");
  const fp = crypto.createHash("sha256").update(seed).digest("hex");
  try {
    fs.writeFileSync(own, fp);
  } catch {}
  return fp;
}

function jwtExpMs(jwt: string): number {
  try {
    return (JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString()).exp || 0) * 1000;
  } catch {
    return 0;
  }
}

function mimoBootstrap(): Promise<string> {
  return new Promise((resolve, reject) => {
    const fp = mimoFingerprint();
    if (!fp) return reject(new Error("could not derive mimo fingerprint"));
    const body = Buffer.from(JSON.stringify({ client: fp }));
    const r = https.request(
      { host: MIMO_HOST, port: 443, method: "POST", path: MIMO_BOOTSTRAP_PATH, headers: { "content-type": "application/json", "content-length": body.length } },
      (resp) => {
        let b = "";
        resp.on("data", (c) => (b += c));
        resp.on("end", () => {
          try {
            const j = JSON.parse(b);
            j.jwt ? resolve(j.jwt) : reject(new Error("bootstrap: no jwt :: " + b.slice(0, 120)));
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    r.setTimeout(20000, () => r.destroy(new Error("mimo bootstrap timeout")));
    r.on("error", reject);
    r.write(body);
    r.end();
  });
}

export async function mimoJwt(): Promise<string> {
  if (_mimoJwt && _mimoExp - Date.now() > 300000) return _mimoJwt;
  _mimoJwt = await mimoBootstrap();
  _mimoExp = jwtExpMs(_mimoJwt) || Date.now() + 600000;
  return _mimoJwt;
}
