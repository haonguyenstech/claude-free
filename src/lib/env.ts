// Shared filesystem locations. Kept dependency-free so both config and the DB layer can import it
// without a cycle. DATA_DIR defaults to the server's working dir (under launchd that's ~/.claude-free).
import path from "node:path";

export const DATA_DIR = process.env.CLAUDE_FREE_HOME || process.cwd();
export const KEYS_FILE = path.join(DATA_DIR, "keys.json");
export const DB_FILE = process.env.CLAUDE_FREE_DB || path.join(DATA_DIR, "claude-free.db");
