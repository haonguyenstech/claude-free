// Password hashing for dashboard user accounts. Self-contained (crypto only) so the DB seed and the
// auth layer can both use it without an import cycle. scrypt with a per-password random salt; the
// stored form is `scrypt$<saltHex>$<hashHex>`.
import crypto from "node:crypto";

const KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEYLEN);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = (stored || "").split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  let got: Buffer;
  try {
    got = crypto.scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  } catch {
    return false;
  }
  return got.length === expected.length && crypto.timingSafeEqual(got, expected);
}
